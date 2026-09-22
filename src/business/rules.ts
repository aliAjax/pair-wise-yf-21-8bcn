// 业务规则：产地 / 暂存位 / 工序常量、到店校验、状态推导、改期校验

export interface ProcessStep {
  id: string;
  name: string;
  done: boolean;
}

export interface RescheduleEntry {
  at: string; // 改期操作时间 ISO
  from: string; // 原承诺取件日 YYYY-MM-DD
  to: string; // 新承诺取件日 YYYY-MM-DD
  reason: string; // 改期原因（必填）
}

export interface RepairOrder {
  id: string; // 工单号
  carpetNo: string; // 毯号
  origin: string; // 产地
  sender: string; // 送修人
  slot: string; // 暂存位
  checkInDate: string; // 入店日 YYYY-MM-DD
  promisedDate: string; // 承诺取件日 YYYY-MM-DD
  processes: ProcessStep[]; // 修复工序及进度
  createdAt: string;
  pickedUp: boolean; // 是否已取件
  pickedUpAt?: string;
  history: RescheduleEntry[]; // 改期历史
}

export type OrderStatus = "active" | "overdue" | "picked";

export type RejectionCode =
  | "duplicate_carpet"
  | "promised_before_checkin"
  | "slot_occupied"
  | "process_incomplete";

export interface Rejection {
  code: RejectionCode;
  message: string;
}

export interface CheckInDraft {
  carpetNo: string;
  origin: string;
  sender: string;
  slot: string;
  checkInDate: string;
  promisedDate: string;
  processes: string[];
}

export const ORIGINS = ["波斯", "安纳托利亚", "高加索", "藏毯"];

export const STORAGE_SLOTS = [
  "A-01",
  "A-02",
  "A-03",
  "A-04",
  "A-05",
  "A-06",
  "B-01",
  "B-02",
  "B-03",
  "B-04",
  "B-05",
  "B-06",
];

export const PRESET_PROCESSES = ["清洗除尘", "破损补线", "纹样修复", "植物固色"];

export function isActive(order: RepairOrder): boolean {
  return !order.pickedUp;
}

export function activeOrders(orders: RepairOrder[]): RepairOrder[] {
  return orders.filter(isActive);
}

export function todayStr(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(base: string, days: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayStr = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayStr}`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatDateTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

/**
 * 新增到店校验：任一规则不通过即整单拒绝。
 * 1. 同毯重复送修：同毯号仍有在店（未取件）工单
 * 2. 承诺取件日早于入店日
 * 3. 暂存位被在店工单占用
 * 4. 工序未完成：一道工序都没登记
 */
export function validateCheckIn(
  draft: CheckInDraft,
  active: RepairOrder[]
): Rejection[] {
  const errors: Rejection[] = [];
  const carpetNo = draft.carpetNo.trim().toUpperCase();

  if (active.some((order) => order.carpetNo === carpetNo)) {
    errors.push({
      code: "duplicate_carpet",
      message: `同毯重复送修：毯号 ${carpetNo} 尚有在店工单，取件前不能重复登记`,
    });
  }

  if (
    draft.checkInDate &&
    draft.promisedDate &&
    draft.promisedDate < draft.checkInDate
  ) {
    errors.push({
      code: "promised_before_checkin",
      message: `承诺取件日 ${draft.promisedDate} 早于入店日 ${draft.checkInDate}`,
    });
  }

  if (active.some((order) => order.slot === draft.slot)) {
    errors.push({
      code: "slot_occupied",
      message: `暂存位 ${draft.slot} 已被在店地毯占用`,
    });
  }

  const processes = draft.processes.map((name) => name.trim()).filter(Boolean);
  if (processes.length === 0) {
    errors.push({
      code: "process_incomplete",
      message: "工序未完成：至少登记一道修复工序",
    });
  }

  return errors;
}

/** 状态推导：已取件 > 逾期（今天已过承诺取件日仍在店）> 在店；重开页面自动重算 */
export function orderStatus(order: RepairOrder, today = todayStr()): OrderStatus {
  if (order.pickedUp) return "picked";
  return today > order.promisedDate ? "overdue" : "active";
}

export function progressOf(order: RepairOrder): {
  done: number;
  total: number;
  percent: number;
} {
  const total = order.processes.length;
  const done = order.processes.filter((step) => step.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** 改期校验：必须写原因，且新日期不能早于入店日 */
export function validateReschedule(
  order: RepairOrder,
  newDate: string,
  reason: string
): string | null {
  if (!newDate) return "请选择新的承诺取件日";
  if (!reason.trim()) return "改期必须填写原因";
  if (newDate === order.promisedDate) return "新取件日与当前承诺取件日相同";
  if (newDate < order.checkInDate)
    return `承诺取件日不能早于入店日 ${order.checkInDate}`;
  return null;
}
