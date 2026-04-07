import axios, { AxiosInstance } from 'axios';
import { query } from '../config/database';

// ── Stage IDs (Retail Pipeline) ───────────────────────────────────────────────
const STAGE_APPOINTMENT_SET = '87743795';
const STAGE_CONTRACT_SIGNED = '60609660';

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
// HubSpot datetime filters accept epoch-ms as a string
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

// ── Search helper ─────────────────────────────────────────────────────────────
type Filter = { propertyName: string; operator: string; value: string };

async function searchDeals(
  client: AxiosInstance,
  filters: Filter[],
  properties: string[],
  countOnly = false,
): Promise<{ total: number; results: any[] }> {
  const makeRequest = async (after?: string) => {
    try {
      return await client.post('/crm/v3/objects/deals/search', {
        filterGroups: [{ filters }],
        properties: countOnly ? ['dealname'] : properties,
        limit: countOnly ? 1 : 200,
        ...(after ? { after } : {}),
      });
    } catch (err: any) {
      if (err.response) {
        const detail = JSON.stringify(err.response.data);
        console.error(`HubSpot search error ${err.response.status}:`, detail);
        console.error('  Filters:', JSON.stringify(filters));
        throw new Error(`HubSpot API error ${err.response.status}: ${detail}`);
      }
      throw err;
    }
  };

  if (countOnly) {
    const res = await makeRequest();
    return { total: res.data.total ?? 0, results: [] };
  }

  const results: any[] = [];
  let after: string | undefined;
  let total = 0;
  do {
    const res = await makeRequest(after);
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
  closing_rate_ytd:       number;
  appt_ytd_count:         number;
  contract_ytd_count:     number;
}

export async function getHubSpotSummary(): Promise<HubSpotSummary> {
  const client = getClient();
  const since7d  = last7DaysStart();
  const sinceYTD = ytdStart();

  // ── Notes on property choice ────────────────────────────────────────────────
  // hs_date_entered_{stageId} is NOT filterable in HubSpot's CRM search API
  // (it's stored but not indexed for search queries).
  //
  // We use these standard filterable properties instead:
  //   • dealstage         — current pipeline stage (always filterable)
  //   • hs_lastmodifieddate — updated whenever any property changes, including
  //                          stage, so it's the best proxy for "recently moved
  //                          into this stage"
  //   • createdate        — when the deal was created (YTD closing rate)
  // ────────────────────────────────────────────────────────────────────────────

  const [
    apptWeek,       // deals currently in Appointment Set, modified last 7 days
    salesWeek,      // deals in Contract Signed, modified last 7 days  → sum amounts
    salesYTD,       // deals in Contract Signed, created YTD           → sum amounts
    apptYTDCount,   // deals in Appointment Set, created YTD           → denominator
    contractYTDCount, // deals in Contract Signed, created YTD         → numerator
  ] = await Promise.all([

    searchDeals(client, [
      { propertyName: 'dealstage',           operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
      { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: since7d },
    ], ['dealname'], /* countOnly */ true),

    searchDeals(client, [
      { propertyName: 'dealstage',           operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: since7d },
    ], ['amount', 'dealname']),

    searchDeals(client, [
      { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'createdate', operator: 'GTE', value: sinceYTD },
    ], ['amount', 'dealname']),

    searchDeals(client, [
      { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
      { propertyName: 'createdate', operator: 'GTE', value: sinceYTD },
    ], ['dealname'], /* countOnly */ true),

    searchDeals(client, [
      { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'createdate', operator: 'GTE', value: sinceYTD },
    ], ['dealname'], /* countOnly */ true),
  ]);

  const weeklySales = Math.round(sumAmounts(salesWeek.results)  * 100) / 100;
  const ytdSales    = Math.round(sumAmounts(salesYTD.results)   * 100) / 100;

  // Closing rate: contracts signed YTD ÷ appointments set YTD
  // Both use createdate so the cohort is consistent
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

// ── Sync HubSpot → scorecard_entries ──────────────────────────────────────────
export async function syncHubSpotToScorecard(): Promise<void> {
  const summary = await getHubSpotSummary();

  // Current week Monday
  const now   = new Date();
  const diff  = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon   = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const weekOf = mon.toISOString().split('T')[0];

  const updates = [
    { metric: 'Appointments',      actual: summary.appointments_this_week },
    { metric: 'Weekly Sales',      actual: summary.weekly_sales_amount    },
    { metric: 'Total Sales (YTD)', actual: summary.ytd_sales_amount       },
    { metric: 'Closing Rate',      actual: summary.closing_rate_ytd       },
  ];

  for (const { metric, actual } of updates) {
    await query(
      `UPDATE scorecard_entries
          SET actual = $1, updated_at = NOW()
        WHERE team = 'leadership' AND week_of = $2 AND metric_name = $3`,
      [actual, weekOf, metric],
    );
  }
}
