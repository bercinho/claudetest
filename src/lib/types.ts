export type Role = "PARENT" | "CHILD";

export type User = {
  id: number;
  name: string;
  role: Role;
  emoji: string;
  color: string;
  active: number;
};

export type Recurrence = "ONCE" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "CUSTOM";

export type TaskStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "MISSED" | "SKIPPED";

export type Task = {
  id: number;
  title: string;
  details: string;
  child_id: number;
  points: number;
  money_cents: number;
  penalty_points: number;
  recurrence: Recurrence;
  days_mask: number;
  due_time: string;
  start_date: string;
  end_date: string | null;
  auto_approve: number;
  active: number;
  created_by: number | null;
  created_at: string;
};

export type TaskInstance = {
  id: number;
  task_id: number;
  child_id: number;
  due_date: string;
  due_time: string;
  status: TaskStatus;
  child_note: string;
  parent_note: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  points_awarded: number;
  money_awarded_cents: number;
};

export type TaskInstanceView = TaskInstance & {
  title: string;
  details: string;
  points: number;
  money_cents: number;
  penalty_points: number;
  auto_approve: number;
  child_name: string;
  child_emoji: string;
};

export type Policy = {
  id: number;
  title: string;
  details: string;
  kind: "REWARD" | "PENALTY";
  points: number;
  money_cents: number;
  child_id: number | null;
  active: number;
  created_at: string;
};

export type Reward = {
  id: number;
  title: string;
  details: string;
  cost_points: number;
  cost_money_cents: number;
  child_id: number | null;
  stock: number | null;
  active: number;
  created_at: string;
};

export type Redemption = {
  id: number;
  reward_id: number | null;
  reward_title: string;
  child_id: number;
  status: "REQUESTED" | "APPROVED" | "DENIED" | "CANCELLED";
  cost_points: number;
  cost_money_cents: number;
  child_note: string;
  parent_note: string;
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
};

export type RequestKind = "MONEY" | "PERMISSION" | "PURCHASE" | "SCREEN_TIME" | "OTHER";

export type FamilyRequest = {
  id: number;
  child_id: number;
  kind: RequestKind;
  title: string;
  details: string;
  amount_cents: number;
  status: "OPEN" | "APPROVED" | "DENIED" | "WITHDRAWN";
  parent_note: string;
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
};

export type Currency = "POINTS" | "MONEY";

export type LedgerSource =
  | "TASK"
  | "TASK_MISSED"
  | "POLICY"
  | "REWARD"
  | "REQUEST"
  | "ALLOWANCE"
  | "GOAL"
  | "MANUAL"
  | "GRADE"
  | "SPORT";

export type LedgerEntry = {
  id: number;
  child_id: number;
  currency: Currency;
  amount: number;
  reason: string;
  source: LedgerSource;
  source_id: number | null;
  created_by: number | null;
  created_at: string;
};

export type Allowance = {
  child_id: number;
  base_cents: number;
  cadence: "WEEKLY" | "MONTHLY";
  payday: number;
  bonus_per_point_cents: number;
  min_points: number;
  active: number;
  last_paid_period: string | null;
};

export type Goal = {
  id: number;
  child_id: number;
  title: string;
  target_cents: number;
  saved_cents: number;
  status: "ACTIVE" | "REACHED" | "CLOSED";
  created_at: string;
  closed_at: string | null;
};

export type Balances = { points: number; money_cents: number };

// ---------------------------------------------------------------------------
// School
// ---------------------------------------------------------------------------

export type Term = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  active: number;
  created_at: string;
};

export type Subject = {
  id: number;
  term_id: number;
  child_id: number;
  name: string;
  teacher: string;
  emoji: string;
  active: number;
  created_at: string;
};

export type GradeKind = "TEST" | "ORAL" | "HOMEWORK" | "PROJECT" | "EXAM" | "OTHER";

export type Grade = {
  id: number;
  subject_id: number;
  child_id: number;
  title: string;
  kind: GradeKind;
  value: number;
  out_of: number;
  weight: number;
  date: string;
  note: string;
  recorded_by: number | null;
  confirmed: number;
  confirmed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Sport and the weekly schedule
// ---------------------------------------------------------------------------

export type SportProfile = {
  child_id: number;
  sport: string;
  team: string;
  coach: string;
  level: string;
  season_start: string | null;
  season_end: string | null;
  notes: string;
};

export type SlotKind = "LESSON" | "TRAINING" | "OTHER";

export type ScheduleSlot = {
  id: number;
  child_id: number;
  kind: SlotKind;
  subject_id: number | null;
  term_id: number | null;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  note: string;
  start_date: string;
  end_date: string | null;
  active: number;
  created_at: string;
};

export type EventKind = "LESSON" | "TRAINING" | "EXAM" | "MATCH" | "TOURNAMENT" | "OTHER";

export type Attendance = "PLANNED" | "PRESENT" | "ABSENT" | "EXCUSED" | "CANCELLED";

export type ScheduleEvent = {
  id: number;
  child_id: number;
  slot_id: number | null;
  kind: EventKind;
  subject_id: number | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  note: string;
  attendance: Attendance;
  created_by: number | null;
  created_at: string;
};

export type SportReport = {
  event_id: number;
  opponent: string;
  score_for: number | null;
  score_against: number | null;
  outcome: "WIN" | "DRAW" | "LOSS" | null;
  goals: number;
  assists: number;
  minutes: number;
  coach_rating: number | null;
  coach_feedback: string;
  own_note: string;
  recorded_by: number | null;
  created_at: string;
};

export type ScheduleEventView = ScheduleEvent & {
  child_name: string;
  child_emoji: string;
  subject_name: string | null;
  subject_emoji: string | null;
  has_report: number;
};
