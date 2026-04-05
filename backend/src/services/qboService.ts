import axios, { AxiosInstance } from 'axios';

const QBO_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';
const QBO_AUTH_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function getQBOConfig() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const accessToken = process.env.QBO_ACCESS_TOKEN;
  const refreshToken = process.env.QBO_REFRESH_TOKEN;
  const realmId = process.env.QBO_REALM_ID;

  if (!clientId || !clientSecret || !accessToken || !realmId) {
    throw new Error('QuickBooks Online environment variables are not fully set (QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ACCESS_TOKEN, QBO_REALM_ID)');
  }

  return { clientId, clientSecret, accessToken, refreshToken, realmId };
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await axios.post(
    QBO_AUTH_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    }
  );
  return response.data.access_token;
}

async function getQBOClient(): Promise<{ client: AxiosInstance; realmId: string }> {
  const config = getQBOConfig();
  let accessToken = config.accessToken;

  const client = axios.create({
    baseURL: `${QBO_BASE_URL}/${config.realmId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/text',
    },
  });

  // Intercept 401 and try token refresh
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401 && config.refreshToken) {
        try {
          accessToken = await refreshAccessToken(config.clientId, config.clientSecret, config.refreshToken);
          error.config.headers.Authorization = `Bearer ${accessToken}`;
          return client.request(error.config);
        } catch {
          throw new Error('QBO token refresh failed. Please re-authenticate.');
        }
      }
      throw error;
    }
  );

  return { client, realmId: config.realmId };
}

function formatQBODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateRanges() {
  const now = new Date();

  // Current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = now;

  // Current week (Monday-Sunday)
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = now;

  return {
    monthStart: formatQBODate(monthStart),
    monthEnd: formatQBODate(monthEnd),
    weekStart: formatQBODate(weekStart),
    weekEnd: formatQBODate(weekEnd),
  };
}

interface PLRow {
  ColData?: Array<{ value?: string }>;
  Rows?: { Row?: PLRow[] };
  Header?: { ColData?: Array<{ value?: string }> };
  type?: string;
}

function extractPLData(report: PLRow): {
  totalIncome: number;
  costOfGoodsSold: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
} {
  let totalIncome = 0;
  let costOfGoodsSold = 0;
  let grossProfit = 0;
  let totalExpenses = 0;
  let netIncome = 0;

  function parseValue(val?: string): number {
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  function findSection(rows: PLRow[], sectionName: string): PLRow | undefined {
    return rows.find((row) => {
      const header = row.Header?.ColData?.[0]?.value || '';
      return header.toLowerCase().includes(sectionName.toLowerCase());
    });
  }

  function getSectionTotal(section: PLRow): number {
    if (!section) return 0;
    const summaryRow = section.Rows?.Row?.find((r) => r.type === 'Total');
    if (summaryRow) {
      const cols = summaryRow.ColData || [];
      const lastCol = cols[cols.length - 1];
      return parseValue(lastCol?.value);
    }
    return 0;
  }

  try {
    const rows: PLRow[] = (report as unknown as { Rows: { Row: PLRow[] } }).Rows?.Row || [];

    const incomeSection = findSection(rows, 'Income') || findSection(rows, 'Revenue');
    if (incomeSection) totalIncome = getSectionTotal(incomeSection);

    const cogsSection = findSection(rows, 'Cost of Goods Sold') || findSection(rows, 'Cost of Sales');
    if (cogsSection) costOfGoodsSold = getSectionTotal(cogsSection);

    grossProfit = totalIncome - costOfGoodsSold;

    const expenseSection = findSection(rows, 'Expenses') || findSection(rows, 'Operating Expenses');
    if (expenseSection) totalExpenses = getSectionTotal(expenseSection);

    // Net income usually appears as the last summary row
    const netRow = rows.find((r) => {
      const header = r.Header?.ColData?.[0]?.value || '';
      return header.toLowerCase().includes('net income') || header.toLowerCase().includes('net profit');
    });
    if (netRow) {
      netIncome = getSectionTotal(netRow);
    } else {
      netIncome = grossProfit - totalExpenses;
    }
  } catch {
    // Return zeros if parsing fails
  }

  return { totalIncome, costOfGoodsSold, grossProfit, totalExpenses, netIncome };
}

export interface QBOSummary {
  monthly: {
    start_date: string;
    end_date: string;
    total_income: number;
    cost_of_goods_sold: number;
    gross_profit: number;
    gross_margin_pct: number;
    total_expenses: number;
    net_income: number;
  };
  weekly: {
    start_date: string;
    end_date: string;
    total_income: number;
    cost_of_goods_sold: number;
    gross_profit: number;
    gross_margin_pct: number;
    total_expenses: number;
    net_income: number;
  };
}

export async function getQBOSummary(): Promise<QBOSummary> {
  const { client } = await getQBOClient();
  const dates = getDateRanges();

  const [monthlyResponse, weeklyResponse] = await Promise.all([
    client.get('/reports/ProfitAndLoss', {
      params: {
        start_date: dates.monthStart,
        end_date: dates.monthEnd,
        minorversion: 65,
      },
    }),
    client.get('/reports/ProfitAndLoss', {
      params: {
        start_date: dates.weekStart,
        end_date: dates.weekEnd,
        minorversion: 65,
      },
    }),
  ]);

  const monthlyData = extractPLData(monthlyResponse.data);
  const weeklyData = extractPLData(weeklyResponse.data);

  return {
    monthly: {
      start_date: dates.monthStart,
      end_date: dates.monthEnd,
      total_income: Math.round(monthlyData.totalIncome * 100) / 100,
      cost_of_goods_sold: Math.round(monthlyData.costOfGoodsSold * 100) / 100,
      gross_profit: Math.round(monthlyData.grossProfit * 100) / 100,
      gross_margin_pct: monthlyData.totalIncome > 0
        ? Math.round((monthlyData.grossProfit / monthlyData.totalIncome) * 10000) / 100
        : 0,
      total_expenses: Math.round(monthlyData.totalExpenses * 100) / 100,
      net_income: Math.round(monthlyData.netIncome * 100) / 100,
    },
    weekly: {
      start_date: dates.weekStart,
      end_date: dates.weekEnd,
      total_income: Math.round(weeklyData.totalIncome * 100) / 100,
      cost_of_goods_sold: Math.round(weeklyData.costOfGoodsSold * 100) / 100,
      gross_profit: Math.round(weeklyData.grossProfit * 100) / 100,
      gross_margin_pct: weeklyData.totalIncome > 0
        ? Math.round((weeklyData.grossProfit / weeklyData.totalIncome) * 10000) / 100
        : 0,
      total_expenses: Math.round(weeklyData.totalExpenses * 100) / 100,
      net_income: Math.round(weeklyData.netIncome * 100) / 100,
    },
  };
}
