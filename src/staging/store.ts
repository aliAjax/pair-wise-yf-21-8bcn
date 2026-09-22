// 取送暂存台 · 状态层
// 所有写操作都先走 rules.ts 校验，通过后才产生新状态；
// 每次状态变化写入 localStorage，重开浏览器数据仍在。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSeedOrders,
  isOverdue,
  todayStr,
  validateIntake,
  validateReschedule,
  type IntakeInput,
  type StagingOrder,
} from "./rules";

const STORAGE_KEY = "hxyfront-62009-staging-orders-v1";

function loadOrders(): StagingOrder[] {
  if (typeof window === "undefined") return createSeedOrders();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StagingOrder[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // 数据损坏时退回内置示例，保证页面可用
  }
  const seeded = createSeedOrders();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // 隐私模式等写入失败时仅保留内存态
  }
  return seeded;
}

function nextId(orders: StagingOrder[], inDate: string): string {
  const prefix = `SG-${inDate.replaceAll("-", "")}-`;
  const used = orders
    .map((o) => o.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const seq = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export function useStagingStore() {
  const [orders, setOrders] = useState<StagingOrder[]>(loadOrders);
  const [today, setToday] = useState<string>(todayStr());

  // 长期开着页面时按天刷新，逾期标记自动更新
  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(todayStr());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // 写入失败不阻断内存中的操作
    }
  }, [orders]);

  /** 新增到店：校验不通过时整单拒绝，状态完全不变 */
  const intake = useCallback(
    (input: IntakeInput): string => {
      let result = "";
      setOrders((prev) => {
        const error = validateIntake(input, prev);
        if (error) {
          result = error.message;
          return prev;
        }
        const order: StagingOrder = {
          id: nextId(prev, input.inDate),
          carpetNo: input.carpetNo.trim(),
          origin: input.origin,
          sender: input.sender.trim(),
          inDate: input.inDate,
          dueDate: input.dueDate,
          slot: input.slot,
          steps: input.processes.map((name) => ({ name, done: false })),
          status: "在店",
          history: [],
          createdAt: new Date().toISOString(),
        };
        return [order, ...prev];
      });
      return result;
    },
    [],
  );

  /** 切换工序进度，返回新数组以触发持久化 */
  const toggleStep = useCallback((orderId: string, stepName: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id !== orderId || o.status !== "在店"
          ? o
          : {
              ...o,
              steps: o.steps.map((s) =>
                s.name === stepName ? { ...s, done: !s.done } : s,
              ),
            },
      ),
    );
  }, []);

  /** 改期：须写原因，旧日期、新日期、原因与时间追加进历史 */
  const reschedule = useCallback(
    (orderId: string, newDate: string, reason: string): string => {
      let result = "";
      setOrders((prev) => {
        const target = prev.find((o) => o.id === orderId);
        if (!target) return prev;
        const error = validateReschedule(target, newDate, reason);
        if (error) {
          result = error;
          return prev;
        }
        return prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                dueDate: newDate,
                history: [
                  ...o.history,
                  {
                    from: o.dueDate,
                    to: newDate,
                    reason: reason.trim(),
                    at: new Date().toISOString(),
                  },
                ],
              }
            : o,
        );
      });
      return result;
    },
    [],
  );

  /** 取件：释放暂存位，单据整体转为只读归档记录 */
  const pickup = useCallback((orderId: string): string => {
    let result = "";
    setOrders((prev) => {
      const target = prev.find((o) => o.id === orderId);
      if (!target) {
        result = "未找到该暂存单";
        return prev;
      }
      if (target.status !== "在店") {
        result = "该单已取件，记录为只读";
        return prev;
      }
      return prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "已取件",
              pickedAt: new Date().toISOString(),
              steps: o.steps.map((s) => ({ ...s, done: true })),
            }
          : o,
      );
    });
    return result;
  }, []);

  const overdueCount = orders.filter(
    (o) => o.status === "在店" && isOverdue(o, today),
  ).length;
  const activeCount = orders.filter((o) => o.status === "在店").length;
  const archivedCount = orders.length - activeCount;

  return {
    orders,
    today,
    intake,
    toggleStep,
    reschedule,
    pickup,
    metrics: {
      activeCount,
      overdueCount,
      archivedCount,
      totalCount: orders.length,
    },
  };
}
