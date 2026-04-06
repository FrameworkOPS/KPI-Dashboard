import axios, { AxiosInstance } from 'axios';
import { query } from '../config/database';

// ── Stage IDs (Retail Pipeline) ───────────────────────────────────────────────
const STAGE_APPOINTMENT_SET  = '87743795';
const STAGE_CONTRACT_SIGNED  = '60609660';

// ── Client ────────────────────────────────────────────────────────────────────
function getClient(): AxiosInstance {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) throw new Error('HUBSPOT_API_KEY environment variable is not set');
  return axios.create({
    baseURL: 'https://api.hubapi.com',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function msStr(d: Date): string {
  return d.getTime().toString();
}

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return msStr(d);
}

function ytdStart(): string {
  return msStr(new Date(new Date().getFullYear(), 0, 1));
}

// ── Paginated search ──────────────────────────────────────────────────────────
async function searchDeals(
  client: AxiosInstance,
  filters: { propertyName: string; operator: string; value: string }[],
  properties: string[],
  countOnly = false,
): Promise<{ total: number; results: any[] }> {
  if (countOnly) {
    const res = await client.post('/crm/v3/objects/deals/search', {
      filterGroups: [{ filters }],
      properties: ['dealname'],
      limit: 1,
    });
    return { total: res.data.total ?? 0, results: [] };
  }

  // Paginate to collect all results
  const results: any[] = [];
  let after: string | undefined;
  let total = 0;

  do {
    const res = await client.post('/crm/v3/objects/deals/search', {
      filterGroups: [{ filters }],
      properties,
      limit: 200,
      ...(after ? { after } : {}),
    });
    total = res.data.total ?? 0;
    results.push(...(res.data.results ?? []));
    after = res.data.paging?.next?.after;
  } while (after);

  return { total, results };
}

function sumAmounts(deals: any[]): number {
  return deals.reduce((sum, d) => sum + (parseFloat(d.properties?.amount || '0') || 0), 0);
}

// ── Public summary ─────────────────────────────────────────────────────────────
export interface HubSpotSummary {
  appointments_this_week: number;
  weekly_sales_amount:    number;
  ytd_sales_amount:       number;
  closing_rate_ytd:       number;   // decimal  e.g. 0.18 = 18 %
  appt_ytd_count:         number;
  contract_ytd_count:     number;
}

export async function getHubSpotSummary(): Promise<HubSpotSummary> {
  const client = getClient();
  const since7d  = last7DaysStart();
  const sinceYTD = ytdStart();

  // Run all queries in parallel
  const [
    apptWeek,
    salesWeek,
    salesYTD,
    apptYTDCount,
    contractYTDCount,
  ] = await Promise.all([

    // 1. Appointments set in the last 7 days
    //    Deals CURRENTLY in Appointment Set stage, entered that stage ≤ 7 days ago
    searchDeals(client, [
      { propertyName: 'dealstage',                        operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
      { propertyName: 'hs_v2_date_entered_current_stage', operator: 'GTE', value: since7d },
    ], ['dealname'], /* countOnly */ true),

    // 2. Weekly Sales – deals that entered Contract Signed in the last 7 days
    searchDeals(client, [
      { propertyName: 'dealstage',                        operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'hs_v2_date_entered_current_stage', operator: 'GTE', value: since7d },
    ], ['amount', 'dealname']),

    // 3. YTD Sales – deals that entered Contract Signed since Jan 1
    searchDeals(client, [
      { propertyName: 'dealstage',                        operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'hs_v2_date_entered_current_stage', operator: 'GTE', value: sinceYTD },
    ], ['amount', 'dealname']),

    // 4. Closing rate denominator – deals that EVER entered Appointment Set YTD
    //    hs_date_entered_{stageId} persists even after the deal moves forward
    searchDeals(client, [
      { propertyName: `hs_date_entered_${STAGE_APPOINTMENT_SET}`, operator: 'GTE', value: sinceYTD },
    ], ['dealname'], /* countOnly */ true),

    // 5. Closing rate numerator – deals that EVER entered Contract Signed YTD
    searchDeals(client, [
      { propertyName: `hs_date_entered_${STAGE_CONTRACT_SIGNED}`, operator: 'GTE', value: sinceYTD },
    ], ['dealname'], /* countOnly */ true),
  ]);

  const weeklySales = Math.round(sumAmounts(salesWeek.results) * 100) / 100;
  const ytdSales    = Math.round(sumAmounts(salesYTD.results)  * 100) / 100;
  const closingRate = apptYTDCount.total > 0
    ? Math.round((contractYTDCount.total / apptYTDCount.total) * 10000) / 10000
    : 0;

  return {
    appointments_this_week: apptWeek.total,
    weekly_sales_amount:    weeklySales,
    ytd_sales_amount:       ytdSales,
    closing_rate_ytd:       closingRate,
    appt_ytd_count:         apptYTDCount.total,
    contract_ytd_count:     contractYTDCount.total,
  };
}

// ── Sync HubSpot data → scorecard_entries ─────────────────────────────────────
// Call this after getHubSpotSummary to write values into the current week's scorecard.
export async function syncHubSpotToScorecard(): Promise<void> {
  const summary = await getHubSpotSummary();

  // Current week Monday
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const weekOf = monday.toISOString().split('T')[0];

  const updates: { metric: string; actual: number }[] = [
    { metric: 'Appointments',       actual: summary.appointments_this_week },
    { metric: 'Weekly Sales',       actual: summary.weekly_sales_amount    },
    { metric: 'Total Sales (YTD)',  actual: summary.ytd_sales_amount       },
    { metric: 'Closing Rate',       actual: summary.closing_rate_ytd       },
  ];

  for (const { metric, actual } of updates) {
    await query(
      `UPDATE scorecard_entries
          SET actual = $1, updated_at = NOW()
        WHERE team = 'leadership'
          AND week_of = $2
          AND metric_name = $3`,
      [actual, weekOf, metric],
    );
  }
}
