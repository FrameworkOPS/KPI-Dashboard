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
    apptWeek,       // deals in Appointment Set, created last 7 days      → count
    salesWeek,      // deals in Contract Signed, project_sold_date last 7 days → sum amounts
    salesYTD,       // deals in Contract Signed, project_sold_date YTD         → sum amounts
    apptYTDCount,   // deals in Appointment Set, created YTD           → denominator
    contractYTDCount, // deals in Contract Signed, created YTD         → numerator
  ] = await Promise.all([

    searchDeals(client, [
      { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
      { propertyName: 'createdate', operator: 'GTE', value: since7d },
    ], ['dealname'], /* countOnly */ true),

    searchDeals(client, [
      { propertyName: 'dealstage',         operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'project_sold_date', operator: 'GTE', value: since7d },
    ], ['amount', 'dealname']),

    searchDeals(client, [
      { propertyName: 'dealstage',         operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'project_sold_date', operator: 'GTE', value: sinceYTD },
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

// ── Deal detail for metric drill-down ─────────────────────────────────────────
export interface HubSpotDeal {
  id: string;
  name: string;
  amount: number | null;
  project_sold_date: string | null;
  createdate: string | null;
}

export interface HubSpotMetricDetail {
  label: string;
  deals: HubSpotDeal[];
  summary?: Record<string, number>;
}

export async function getHubSpotMetricDetail(metricName: string): Promise<HubSpotMetricDetail> {
  const client = getClient();
  const since7d  = last7DaysStart();
  const sinceYTD = ytdStart();
  const n = metricName.toLowerCase();

  const mapDeals = (results: any[], includeSold = false): HubSpotDeal[] =>
    results.map(d => ({
      id: d.id,
      name: d.properties?.dealname || '(unnamed)',
      amount: d.properties?.amount ? parseFloat(d.properties.amount) : null,
      project_sold_date: includeSold ? (d.properties?.project_sold_date || null) : null,
      createdate: d.properties?.createdate || null,
    }));

  if (n.includes('appointment')) {
    const res = await searchDeals(client, [
      { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
      { propertyName: 'createdate', operator: 'GTE', value: since7d },
    ], ['dealname', 'createdate', 'amount']);
    return { label: 'Appointments Set This Week', deals: mapDeals(res.results) };
  }

  if (n.includes('weekly') && (n.includes('sale') || n.includes('revenue'))) {
    const res = await searchDeals(client, [
      { propertyName: 'dealstage',         operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'project_sold_date', operator: 'GTE', value: since7d },
    ], ['dealname', 'amount', 'project_sold_date']);
    return { label: 'Sales Closed This Week', deals: mapDeals(res.results, true) };
  }

  if ((n.includes('ytd') || n.includes('total')) && n.includes('sale')) {
    const res = await searchDeals(client, [
      { propertyName: 'dealstage',         operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
      { propertyName: 'project_sold_date', operator: 'GTE', value: sinceYTD },
    ], ['dealname', 'amount', 'project_sold_date']);
    return { label: 'YTD Sales', deals: mapDeals(res.results, true) };
  }

  if (n.includes('closing') || n.includes('close rate')) {
    const [appts, contracts] = await Promise.all([
      searchDeals(client, [
        { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_APPOINTMENT_SET },
        { propertyName: 'createdate', operator: 'GTE', value: sinceYTD },
      ], ['dealname'], true),
      searchDeals(client, [
        { propertyName: 'dealstage',  operator: 'EQ',  value: STAGE_CONTRACT_SIGNED },
        { propertyName: 'createdate', operator: 'GTE', value: sinceYTD },
      ], ['dealname'], true),
    ]);
    const rate = appts.total > 0 ? contracts.total / appts.total : 0;
    return {
      label: 'YTD Closing Rate',
      deals: [],
      summary: {
        appointments_ytd: appts.total,
        contracts_ytd: contracts.total,
        closing_rate: Math.round(rate * 10000) / 10000,
      },
    };
  }

  return { label: metricName, deals: [] };
}

// ── Sync HubSpot → scorecard_entries ──────────────────────────────────────────
export async function syncHubSpotToScorecard(): Promise<void> {
  const summary = await getHubSpotSummary();

  // Current week Monday
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
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
    // Try update first; if no row exists for this week, upsert from template
    const upd = await query(
      `UPDATE scorecard_entries
          SET actual = $1, data_source = 'hubspot', updated_at = NOW()
        WHERE team = 'leadership' AND week_of = $2 AND metric_name = $3`,
      [actual, weekOf, metric],
    );

    if ((upd.rowCount ?? 0) === 0) {
      // No row for this week yet — insert using template as base
      await query(
        `INSERT INTO scorecard_entries
           (team, week_of, metric_name, goal, goal_text, actual,
            is_on_track, display_format, lower_is_better, data_source)
         SELECT
           'leadership', $2, t.metric_name, t.goal, t.goal_text, $3,
           CASE
             WHEN t.lower_is_better THEN ($3 <= t.goal)
             ELSE ($3 >= t.goal)
           END,
           t.display_format, t.lower_is_better, 'hubspot'
         FROM scorecard_templates t
         WHERE t.team = 'leadership' AND t.metric_name = $1
         ON CONFLICT (team, week_of, metric_name) DO UPDATE
           SET actual      = EXCLUDED.actual,
               is_on_track = EXCLUDED.is_on_track,
               data_source = 'hubspot',
               updated_at  = NOW()`,
        [metric, weekOf, actual],
      );
    }
  }
}
