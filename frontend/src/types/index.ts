export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'leadership' | 'manager';
  team: 'sales' | 'production' | 'leadership' | 'all';
  active: boolean;
}

export interface ScorecardEntry {
  id: string;
  team: string;
  week_of: string;
  metric_name: string;
  goal: number | null;
  goal_text: string | null;
  actual: number | null;
  is_on_track: boolean | null;
  display_format: string;
  lower_is_better: boolean;
  data_source: string;
  notes: string | null;
  created_by: string;
  sort_order?: number;
}

export interface ScorecardTemplate {
  id: string;
  team: string;
  metric_name: string;
  goal: number | null;
  goal_text: string | null;
  display_format: string;
  lower_is_better: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Rock {
  id: string;
  team: string;
  owner_id: string;
  owner?: User;
  title: string;
  description: string | null;
  quarter: number;
  year: number;
  status: 'on_track' | 'off_track' | 'done' | 'not_started';
  completion_percentage: number;
  due_date: string | null;
  created_by: string;
  created_at: string;
}

export interface Issue {
  id: string;
  team: string;
  title: string;
  description: string | null;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'solved';
  owner_id: string | null;
  owner?: User;
  created_by: string;
  created_at: string;
}

export interface Todo {
  id: string;
  team: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  owner?: User;
  due_date: string | null;
  status: 'pending' | 'complete';
  created_by: string;
  created_at: string;
}

export interface VTOSection {
  id: string;
  section_key: string;
  title: string;
  content: Record<string, any>;
  updated_at: string;
}

export interface AccountabilitySeat {
  id: string;
  seat_name: string;
  seat_description: string | null;
  owner_id: string | null;
  owner?: User;
  parent_seat_id: string | null;
  responsibilities: string[];
  sort_order: number;
  children?: AccountabilitySeat[];
}

export interface Meeting {
  id: string;
  team: string;
  meeting_date: string;
  meeting_time: string | null;
  meeting_link: string | null;
  attendee_emails: string[] | null;
  segue: string | null;
  scorecard_notes: string | null;
  rocks_notes: string | null;
  headlines: string | null;
  todos_notes: string | null;
  ids_issues: string | null;
  conclude_notes: string | null;
  rating: number | null;
  status: 'scheduled' | 'in_progress' | 'complete';
  reminder_sent: boolean;
  created_by: string;
}

export interface QBOSummary {
  total_revenue: number;
  total_expenses: number;
  net_income: number;
  accounts_receivable: number;
  accounts_payable: number;
  period: string;
}

export type TeamType = 'sales' | 'production' | 'leadership' | 'all';
export type RoleType = 'admin' | 'leadership' | 'manager';
