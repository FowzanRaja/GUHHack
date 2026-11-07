export type Money = number;

export type Schedule =
  | { kind: 'once'; date: string }
  | { kind: 'monthly'; day: number }
  | { kind: 'weekly'; anchorDate: string }
  | { kind: 'fortnightly'; anchorDate: string }
  | { kind: 'interval'; anchorDate: string; everyDays: number };

export interface IncomeSource {
  id: string;
  name: string;
  amount: Money;
  schedule: Schedule;
}

export type ExpenseCategory =
  | 'bills'
  | 'food'
  | 'transport'
  | 'subscriptions'
  | 'personal'
  | 'other';

export interface Expense {
  id: string;
  name: string;
  amount: Money;
  category: ExpenseCategory;
  essential: boolean;
  schedule: Schedule;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: Money;
  currentAmount: Money;
  targetDate: string;
  colour: string;
}

export interface ManualPot {
  id: string;
  name: string;
  allocation: Money;
  priority: 'essential' | 'everyday' | 'savings' | 'flexible';
  colour: string;
}

export interface IncomeOverride {
  id: string;
  sourceId: string;
  originalDate: string;
  amount: Money;
  newDate?: string;
  note?: string;
}

export interface FinancialState {
  version: 1;
  customerName: string;
  currentBalance: Money;
  incomes: IncomeSource[];
  expenses: Expense[];
  goals: SavingsGoal[];
  manualPots: ManualPot[];
  incomeOverrides: IncomeOverride[];
  allocationOverrides: Record<string, Money>;
  simplifiedMode: boolean;
  isDemo: boolean;
  lastUpdated: string;
}

export type PotPriority = 'essential' | 'everyday' | 'savings' | 'flexible';

export interface PlannedPot {
  id: string;
  name: string;
  allocation: Money;
  requested: Money;
  priority: PotPriority;
  colour: string;
  description: string;
  goalId?: string;
  protected?: boolean;
}

export interface FinancialPlan {
  month: string;
  expectedIncome: Money;
  essentialCommitments: Money;
  everydayNeeds: Money;
  savingsAllocated: Money;
  flexibleSpending: Money;
  totalAllocated: Money;
  unallocated: Money;
  shortfall: Money;
  pots: PlannedPot[];
  notices: PlanNotice[];
}

export interface PlanNotice {
  id: string;
  tone: 'positive' | 'info' | 'warning' | 'danger';
  title: string;
  message: string;
}

export interface FinancialEvent {
  id: string;
  date: string;
  type: 'income' | 'expense' | 'allocation' | 'goal' | 'warning';
  name: string;
  amount: Money;
  balanceImpact: Money;
  sourceId?: string;
  detail?: string;
  runningBalance?: Money;
}

export type AssistantAction =
  | {
      type: 'financial_profile';
      summary: string;
      incomes: Array<{ name: string; amount: Money; schedule: Schedule }>;
      expenses: Array<{
        name: string;
        amount: Money;
        category: ExpenseCategory;
        essential: boolean;
        schedule: Schedule;
      }>;
      currentBalance?: Money;
      missingInformation?: string[];
    }
  | {
      type: 'temporary_income_change';
      summary: string;
      incomeSourceId?: string;
      amount: Money;
      date?: string;
    }
  | {
      type: 'permanent_income_change';
      summary: string;
      incomeSourceId?: string;
      amount: Money;
    }
  | {
      type: 'expense_change';
      summary: string;
      expenseId?: string;
      name?: string;
      amount: Money;
      date?: string;
      permanent: boolean;
      category?: ExpenseCategory;
      essential?: boolean;
    }
  | {
      type: 'new_goal';
      summary: string;
      name: string;
      targetAmount: Money;
      currentAmount?: Money;
      targetDate: string;
    }
  | {
      type: 'pot_transfer';
      summary: string;
      fromPotId: string;
      toPotId: string;
      amount: Money;
    }
  | {
      type: 'income_delay';
      summary: string;
      incomeSourceId?: string;
      originalDate?: string;
      daysLate: number;
    }
  | {
      type: 'affordability_question' | 'scenario';
      summary: string;
      amount?: Money;
      incomeReduction?: Money;
      month?: string;
    }
  | { type: 'clarification'; summary: string; question: string }
  | { type: 'explanation'; summary: string; answer: string };

export interface AssistantResponse {
  message: string;
  action: AssistantAction;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: string;
}
