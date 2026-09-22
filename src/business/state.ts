// 业务状态：localStorage 持久化，数据保留在浏览器，重开仍在

import {
  CheckInDraft,
  ProcessStep,
  RepairOrder,
  RescheduleEntry,
  addDays,
  activeOrders,
  todayStr,
  uid,
  validateCheckIn,
} from "./rules";

const STORAGE_KEY = "carpet-staging-desk:v1";

function makeProcesses(names: string[], doneFlags: boolean[]): ProcessStep[] {
  return names.map((name, index) => ({
    id: uid("p"),
    name,
    done: doneFlags[index] ?? false,
  }));
}

function seedOrders(): RepairOrder[] {
  const today = todayStr();
  return [
    {
      id: "RP-0001",
      carpetNo: "CAR-092",
      origin: "波斯",
      sender: "陈牧之",
      slot: "A-01",
      checkInDate: addDays(today, -6),
      promisedDate: addDays(today, 2),
      processes: makeProcesses(["清洗除尘", "破损补线"], [true, false]),
      createdAt: new Date(addDays(today, -6) + "T09:12").toISOString(),
      pickedUp: false,
      history: [],
    },
    {
      id: "RP-0002",
      carpetNo: "CAR-117",
      origin: "安纳托利亚",
      sender: "林晚舟",
      slot: "B-03",
      checkInDate: addDays(today, -10),
      promisedDate: addDays(today, -1),
      processes: makeProcesses(
        ["清洗除尘", "破损补线", "纹样修复"],
        [true, true, false]
      ),
      createdAt: new Date(addDays(today, -10) + "T14:40").toISOString(),
      pickedUp: false,
      history: [
        {
          at: new Date(addDays(today, -3) + "T10:05").toISOString(),
          from: addDays(today, -4),
          to: addDays(today, -1),
          reason: "补线色号需从产地重新调配，客户已电话确认",
        },
      ],
    },
    {
      id: "RP-0003",
      carpetNo: "CAR-138",
      origin: "藏毯",
      sender: "卓玛",
      slot: "A-05",
      checkInDate: addDays(today, -2),
      promisedDate: addDays(today, 5),
      processes: makeProcesses(["植物固色"], [false]),
      createdAt: new Date(addDays(today, -2) + "T11:25").toISOString(),
      pickedUp: false,
      history: [],
    },
    {
      id: "RP-0004",
      carpetNo: "CAR-064",
      origin: "高加索",
      sender: "周临川",
      slot: "B-06",
      checkInDate: addDays(today, -20),
      promisedDate: addDays(today, -12),
      processes: makeProcesses(
        ["清洗除尘", "破损补线", "纹样修复", "植物固色"],
        [true, true, true, true]
      ),
      createdAt: new Date(addDays(today, -20) + "T16:02").toISOString(),
      pickedUp: true,
      pickedUpAt: new Date(addDays(today, -12) + "T15:30").toISOString(),
      history: [],
    },
  ];
}

function loadOrders(): RepairOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seed = seedOrders();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as RepairOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return seedOrders();
  }
}

let orders: RepairOrder[] = loadOrders();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // 浏览器存储不可用时仅保留内存数据
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getOrders(): RepairOrder[] {
  return orders;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface CheckInResult {
  ok: boolean;
  order?: RepairOrder;
  errors: { code: string; message: string }[];
}

/** 新增到店：四条规则任一不通过则整单拒绝，列表与暂存位均不变 */
export function checkInOrder(draft: CheckInDraft): CheckInResult {
  const errors = validateCheckIn(draft, activeOrders(orders));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const order: RepairOrder = {
    id: nextId(),
    carpetNo: draft.carpetNo.trim().toUpperCase(),
    origin: draft.origin,
    sender: draft.sender.trim(),
    slot: draft.slot,
    checkInDate: draft.checkInDate,
    promisedDate: draft.promisedDate,
    processes: draft.processes
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ id: uid("p"), name, done: false })),
    createdAt: new Date().toISOString(),
    pickedUp: false,
    history: [],
  };

  orders = [order, ...orders];
  persist();
  emit();
  return { ok: true, order, errors: [] };
}

function nextId(): string {
  const max = orders.reduce((acc, order) => {
    const match = /^RP-(\d+)$/.exec(order.id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `RP-${String(max + 1).padStart(4, "0")}`;
}

/** 取件：标记已取件并释放暂存位，工单转为只读历史记录 */
export function pickUpOrder(id: string): RepairOrder | null {
  const order = orders.find((item) => item.id === id);
  if (!order || order.pickedUp) return null;
  order.pickedUp = true;
  order.pickedUpAt = new Date().toISOString();
  persist();
  emit();
  return order;
}

/** 改期：须写原因，每次改期追加一条历史，不覆盖旧记录 */
export function rescheduleOrder(
  id: string,
  newDate: string,
  reason: string
): RepairOrder | null {
  const order = orders.find((item) => item.id === id);
  if (!order || order.pickedUp || newDate === order.promisedDate) return null;

  const entry: RescheduleEntry = {
    at: new Date().toISOString(),
    from: order.promisedDate,
    to: newDate,
    reason: reason.trim(),
  };
  order.promisedDate = newDate;
  order.history = [...order.history, entry];
  persist();
  emit();
  return order;
}

/** 更新工序进度（仅在店工单可改） */
export function toggleProcess(orderId: string, stepId: string): void {
  const order = orders.find((item) => item.id === orderId);
  if (!order || order.pickedUp) return;
  const step = order.processes.find((item) => item.id === stepId);
  if (!step) return;
  step.done = !step.done;
  persist();
  emit();
}

/** 测试/重置用：清空后恢复演示数据 */
export function resetToSeed(): void {
  orders = seedOrders();
  persist();
  emit();
}
