import axios from 'axios';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

function getHubSpotClient() {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY environment variable is not set');
  }
  return axios.create({
    baseURL: HUBSPOT_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getMonthStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString();
}

export interface HubSpotSummary {
  deals_closed_this_week: number;
  deals_closed_this_month: number;
  revenue_closed_this_week: number;
  revenue_closed_this_month: number;
  pipeline_value: number;
  new_leads_this_week: number;
  new_leads_this_month: number;
  conversion_rate: number;
}

export async function getHubSpotSummary(): Promise<HubSpotSummary> {
  const client = getHubSpotClient();
  const now = new Date();
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);

  // Deals closed this week
  const [closedWeekResult, closedMonthResult, openDealsResult, leadsWeekResult, leadsMonthResult] = await Promise.all([
    // Closed won deals this week
    client.post('/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
            { propertyName: 'closedate', operator: 'GTE', value: new Date(weekStart).getTime().toString() },
          ],
        },
      ],
      properties: ['dealname', 'amount', 'closedate', 'dealstage'],
      limit: 100,
    }),
    // Closed won deals this month
    client.post('/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
            { propertyName: 'closedate', operator: 'GTE', value: new Date(monthStart).getTime().toString() },
          ],
        },
      ],
      properties: ['dealname', 'amount', 'closedate', 'dealstage'],
      limit: 200,
    }),
    // Open deals pipeline
    client.post('/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedwon' },
            { propertyName: 'dealstage', operator: 'NEQ', value: 'closedlost' },
          ],
        },
      ],
      properties: ['dealname', 'amount', 'dealstage'],
      limit: 500,
    }),
    // New contacts/leads this week
    client.post('/crm/v3/objects/contacts/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'createdate', operator: 'GTE', value: new Date(weekStart).getTime().toString() },
          ],
        },
      ],
      properties: ['firstname', 'lastname', 'email', 'createdate'],
      limit: 100,
    }),
    // New contacts/leads this month
    client.post('/crm/v3/objects/contacts/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'createdate', operator: 'GTE', value: new Date(monthStart).getTime().toString() },
          ],
        },
      ],
      properties: ['firstname', 'lastname', 'email', 'createdate'],
      limit: 200,
    }),
  ]);

  const closedWeekDeals = closedWeekResult.data.results || [];
  const closedMonthDeals = closedMonthResult.data.results || [];
  const openDeals = openDealsResult.data.results || [];
  const leadsWeek = leadsWeekResult.data.results || [];
  const leadsMonth = leadsMonthResult.data.results || [];

  const revenueWeek = closedWeekDeals.reduce((sum: number, deal: { properties: { amount?: string } }) => {
    return sum + (parseFloat(deal.properties.amount || '0') || 0);
  }, 0);

  const revenueMonth = closedMonthDeals.reduce((sum: number, deal: { properties: { amount?: string } }) => {
    return sum + (parseFloat(deal.properties.amount || '0') || 0);
  }, 0);

  const pipelineValue = openDeals.reduce((sum: number, deal: { properties: { amount?: string } }) => {
    return sum + (parseFloat(deal.properties.amount || '0') || 0);
  }, 0);

  // Conversion rate: closed won deals this month / (closed won + closed lost) this month
  let conversionRate = 0;
  try {
    const closedLostResult = await client.post('/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' },
            { propertyName: 'closedate', operator: 'GTE', value: new Date(monthStart).getTime().toString() },
          ],
        },
      ],
      properties: ['dealname', 'closedate'],
      limit: 200,
    });
    const closedLost = closedLostResult.data.total || 0;
    const closedWon = closedMonthDeals.length;
    const total = closedWon + closedLost;
    conversionRate = total > 0 ? Math.round((closedWon / total) * 100) : 0;
  } catch {
    conversionRate = 0;
  }

  return {
    deals_closed_this_week: closedWeekDeals.length,
    deals_closed_this_month: closedMonthDeals.length,
    revenue_closed_this_week: Math.round(revenueWeek * 100) / 100,
    revenue_closed_this_month: Math.round(revenueMonth * 100) / 100,
    pipeline_value: Math.round(pipelineValue * 100) / 100,
    new_leads_this_week: leadsWeek.length,
    new_leads_this_month: leadsMonth.length,
    conversion_rate: conversionRate,
  };
}
