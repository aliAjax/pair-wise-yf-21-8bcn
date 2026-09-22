// 取送暂存台 · 业务规则层
// 纯类型、常量与无副作用的校验/判定函数，页面与存储层都只依赖这里的规则。

export const ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯"] as const;

export const STORAGE_SLOTS = [
  "A-01",
  "A-02",
  "A-03",
  "B-01",
  "B-02",
  "B-03",
] as const;

// 登记送修时可勾选的修复工序
export const PROCESSES = [
  "清洗除尘",
  "纹样补线",
  "色卡对色",
  "边缘加固",
  "平整定型",
  "质检验收",
] as const;

export type StageStatus = "在店" | "已取件";

export interface RepairStep {
  name: string;
  done: boolean;
}

export interface RescheduleLog {
  from: string;
  to: string;
  reason: string;
  at: string; // ISO 时间戳，改期历史只追加不修改
}

export interface StagingOrder {
  id: string; // 暂存单号
  carpetNo: string; // 毯号
  origin: string; // 产地
  sender: string; // 送修人
  inDate: string; // 入店日 YYYY-MM-DD
  dueDate: string; // 承诺取件日 YYYY-MM-DD
  slot: string; // 暂存位；取件后字段保留为只读历史，但不再占用
  steps: RepairStep[]; // 修复工序进度
  status: StageStatus;
  history: RescheduleLog[];
  pickedAt?: string; // 实际取件时间
  createdAt: string;
}

export interface IntakeInput {
  carpetNo: string;
  origin: string;
  sender: string;
  inDate: string;
  dueDate: string;
  slot: string;
  processes: string[];
}

// 四类整单拒绝原因，顺序即登记时的校验顺序
export type IntakeErrorCode =
  | "DUPLICATE_CARPET"
  | "DUE_BEFORE_IN"
  | "SLOT_OCCUPIED"
  | "PROCESS_INCOMPLETE";

export interface IntakeError {
  code: IntakeErrorCode;
  message: string;
}

export function todayStr(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function addDays(base: string, delta: number): string {
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + delta);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

const ERROR_TEXT: Record<IntakeErrorCode, string> = {
  DUPLICATE_CARPET: "同毯重复送修：该毯号已有在店修复单",
  DUE_BEFORE_IN: "承诺取件日早于入店日",
  SLOT_OCCUPIED: "暂存位已被占用",
  PROCESS_INCOMPLETE: "工序未完成：至少登记一道修复工序",
};

/**
 * 新增到店登记校验。任一规则不通过即整单拒绝，
 * 调用方必须先校验、后写状态，保证列表、暂存位和进度不变。
 */
export function validateIntake(
  input: IntakeInput,
  orders: StagingOrder[],
): IntakeError | null {
  if (
    !input.carpetNo.trim() ||
    !input.sender.trim() ||
    !input.origin ||
    !input.inDate ||
    !input.dueDate ||
    !input.slot
  ) {
    return {
      code: "PROCESS_INCOMPLETE",
      message: "登记信息不完整，请补全后再提交",
    };
  }

  const active = orders.filter((o) => o.status === "在店");
  const carpetNo = input.carpetNo.trim();

  if (active.some((o) => o.carpetNo.trim() === carpetNo)) {
    return {
      code: "DUPLICATE_CARPET",
      message: `${ERROR_TEXT.DUPLICATE_CARPET}（毯号 ${carpetNo}），整单已拒绝`,
    };
  }

  // 日期为 YYYY-MM-DD，字典序即可比较先后
  if (input.dueDate < input.inDate) {
    return {
      code: "DUE_BEFORE_IN",
      message: `${ERROR_TEXT.DUE_BEFORE_IN}（入店 ${input.inDate} / 取件 ${input.dueDate}），整单已拒绝`,
    };
  }

  const holder = active.find((o) => o.slot === input.slot);
  if (holder) {
    return {
      code: "SLOT_OCCUPIED",
      message: `${ERROR_TEXT.SLOT_OCCUPIED}（${input.slot} 存放 ${holder.carpetNo}），整单已拒绝`,
    };
  }

  if (input.processes.length === 0) {
    return {
      code: "PROCESS_INCOMPLETE",
      message: `${ERROR_TEXT.PROCESS_INCOMPLETE}，整单已拒绝`,
    };
  }

  return null;
}

/** 超期自动标逾期：在店且承诺取件日早于今天（取件当日不算逾期） */
export function isOverdue(order: StagingOrder, today = todayStr()): boolean {
  return order.status === "在店" && order.dueDate < today;
}

export type DisplayStatus = "逾期" | "待取件" | "已取件";

export function displayStatus(
  order: StagingOrder,
  today = todayStr(),
): DisplayStatus {
  if (order.status === "已取件") return "已取件";
  return isOverdue(order, today) ? "逾期" : "待取件";
}

/** 取件后释放暂存位：占用只统计在店单，归档单的 slot 仅作只读历史 */
export function slotOccupancy(
  orders: StagingOrder[],
): Map<string, StagingOrder> {
  const map = new Map<string, StagingOrder>();
  orders
    .filter((o) => o.status === "在店")
    .forEach((o) => map.set(o.slot, o));
  return map;
}

export function progressPct(steps: RepairStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.done).length;
  return Math.round((done / steps.length) * 100);
}

/** 改期：新日期不得早于入店日，且必须写明原因 */
export function validateReschedule(
  order: StagingOrder,
  newDate: string,
  reason: string,
): string | null {
  if (order.status !== "在店") return "已取件的归档记录为只读，不能改期";
  if (!newDate) return "请选择新的承诺取件日";
  if (newDate < order.inDate) return "新取件日不能早于入店日";
  if (newDate === order.dueDate) return "新取件日与当前日期相同，无需改期";
  if (!reason.trim()) return "改期须填写原因";
  return null;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** 首次打开（浏览器无数据）时的示例台账 */
export function createSeedOrders(): StagingOrder[] {
  const today = todayStr();
  const d = (delta: number) => addDays(today, delta);
  const stepsOf = (names: readonly string[], doneCount: number): RepairStep[] =>
    names.map((name, i) => ({ name, done: i < doneCount }));

  return [
    {
      id: `SG-${d(-8).replaceAll("-", "")}-001`,
      carpetNo: "CAR-092",
      origin: "波斯",
      sender: "阿依古丽",
      inDate: d(-8),
      dueDate: d(-2),
      slot: "A-01",
      steps: stepsOf(PROCESSES.slice(0, 4), 3),
      status: "在店",
      history: [
        {
          from: d(-5),
          to: d(-2),
          reason: "补线羊毛未到货，与送修人电话确认顺延",
          at: new Date(`${d(-5)}T10:20:00`).toISOString(),
        },
      ],
      createdAt: new Date(`${d(-8)}T09:12:00`).toISOString(),
    },
    {
      id: `SG-${d(-6).replaceAll("-", "")}-001`,
      carpetNo: "CAR-117",
      origin: "安纳托利亚",
      sender: "李闻笙",
      inDate: d(-6),
      dueDate: d(4),
      slot: "B-02",
      steps: stepsOf(PROCESSES.slice(0, 4), 2),
      status: "在店",
      history: [],
      createdAt: new Date(`${d(-6)}T14:05:00`).toISOString(),
    },
    {
      id: `SG-${d(-3).replaceAll("-", "")}-001`,
      carpetNo: "CAR-138",
      origin: "藏毯",
      sender: "卓玛工坊",
      inDate: d(-3),
      dueDate: d(7),
      slot: "A-03",
      steps: stepsOf(PROCESSES.slice(0, 3), 1),
      status: "在店",
      history: [],
      createdAt: new Date(`${d(-3)}T11:40:00`).toISOString(),
    },
    {
      id: `SG-${d(-25).replaceAll("-", "")}-002`,
      carpetNo: "CAR-077",
      origin: "高加索",
      sender: "沈知秋",
      inDate: d(-25),
      dueDate: d(-12),
      slot: "B-01",
      steps: stepsOf(PROCESSES, 6),
      status: "已取件",
      history: [
        {
          from: d(-15),
          to: d(-12),
          reason: "客户出差，申请延后三日取件",
          at: new Date(`${d(-15)}T16:30:00`).toISOString(),
        },
      ],
      pickedAt: new Date(`${d(-11)}T17:05:00`).toISOString(),
      createdAt: new Date(`${d(-25)}T10:00:00`).toISOString(),
    },
  ];
}
