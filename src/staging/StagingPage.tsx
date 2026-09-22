// 取送暂存台 · 页面层
// 按产地筛选的在店列表、暂存位看板、到店登记、工序进度、改期与取件归档。

import { useMemo, useState } from "react";
import {
  ORIGINS,
  PROCESSES,
  STORAGE_SLOTS,
  addDays,
  displayStatus,
  formatDateTime,
  progressPct,
  slotOccupancy,
  todayStr,
  type DisplayStatus,
  type StagingOrder,
} from "./rules";
import { useStagingStore } from "./store";

const STATUS_LABEL: Record<DisplayStatus, string> = {
  逾期: "逾期",
  待取件: "待取件",
  已取件: "已取件",
};

function overdueDays(order: StagingOrder, today: string): number {
  const due = new Date(`${order.dueDate}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

function StatusBadge({
  order,
  today,
}: {
  order: StagingOrder;
  today: string;
}) {
  const status = displayStatus(order, today);
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

function SlotBoard({ orders }: { orders: StagingOrder[] }) {
  const occupancy = useMemo(() => slotOccupancy(orders), [orders]);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>暂存位</p>
          <h2>暂存位看板</h2>
        </div>
        <span className="hint">取件后自动释放</span>
      </div>
      <div className="slots">
        {STORAGE_SLOTS.map((slot) => {
          const holder = occupancy.get(slot);
          return (
            <div
              key={slot}
              className={`slot ${holder ? "slot-busy" : "slot-free"}`}
              title={holder ? `占用：${holder.carpetNo}` : "空闲"}
            >
              <b>{slot}</b>
              <span>{holder ? holder.carpetNo : "空闲"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface IntakeFormProps {
  today: string;
  onSubmit: (input: {
    carpetNo: string;
    origin: string;
    sender: string;
    inDate: string;
    dueDate: string;
    slot: string;
    processes: string[];
  }) => string;
}

function IntakeForm({ today, onSubmit }: IntakeFormProps) {
  const [carpetNo, setCarpetNo] = useState("");
  const [origin, setOrigin] = useState<string>(ORIGINS[0]);
  const [sender, setSender] = useState("");
  const [inDate, setInDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 7));
  const [slot, setSlot] = useState<string>(STORAGE_SLOTS[0]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [reject, setReject] = useState("");
  const [success, setSuccess] = useState("");

  const clearNotices = () => {
    setReject("");
    setSuccess("");
  };

  const toggleProcess = (name: string) => {
    clearNotices();
    setProcesses((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  const handleSubmit = () => {
    const error = onSubmit({
      carpetNo,
      origin,
      sender,
      inDate,
      dueDate,
      slot,
      processes,
    });
    if (error) {
      // 整单拒绝：表单数据保留供核对，列表/暂存位/进度均未变化
      setReject(error);
      setSuccess("");
      return;
    }
    setReject("");
    setSuccess(`登记成功：毯号 ${carpetNo.trim()} 已入暂存位 ${slot}`);
    setCarpetNo("");
    setSender("");
    setOrigin(ORIGINS[0]);
    setInDate(today);
    setDueDate(addDays(today, 7));
    setSlot(STORAGE_SLOTS[0]);
    setProcesses([]);
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>到店登记</p>
          <h2>新增送修暂存</h2>
        </div>
        <button className="primary" type="button" onClick={handleSubmit}>
          登记入店
        </button>
      </div>

      {reject && (
        <div className="alert alert-reject" role="alert">
          <b>整单拒绝</b>
          <span>{reject}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-ok" role="status">
          <span>{success}</span>
        </div>
      )}

      <div className="field-grid">
        <label>
          <span>毯号</span>
          <input
            value={carpetNo}
            placeholder="如 CAR-204"
            onChange={(e) => {
              clearNotices();
              setCarpetNo(e.target.value);
            }}
          />
        </label>
        <label>
          <span>送修人</span>
          <input
            value={sender}
            placeholder="登记送修人姓名 / 工坊"
            onChange={(e) => {
              clearNotices();
              setSender(e.target.value);
            }}
          />
        </label>
        <label>
          <span>地毯产地</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>暂存位</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {STORAGE_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>入店日</span>
          <input
            type="date"
            value={inDate}
            max={today}
            onChange={(e) => {
              clearNotices();
              setInDate(e.target.value);
            }}
          />
        </label>
        <label>
          <span>承诺取件日</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              clearNotices();
              setDueDate(e.target.value);
            }}
          />
        </label>
      </div>

      <div className="process-pick">
        <span>登记工序（至少一道）</span>
        <div className="chips">
          {PROCESSES.map((p) => (
            <button
              type="button"
              key={p}
              className={processes.includes(p) ? "chip-on" : ""}
              onClick={() => toggleProcess(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <ul className="rule-list">
        <li>同毯重复送修、取件日早于入店日、暂存位被占用或工序未完成，整单拒绝。</li>
      </ul>
    </section>
  );
}

function RescheduleBox({
  order,
  onSubmit,
}: {
  order: StagingOrder;
  onSubmit: (newDate: string, reason: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(order.dueDate);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        改期
      </button>
    );
  }

  const submit = () => {
    const err = onSubmit(newDate, reason);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setReason("");
    setOpen(false);
  };

  return (
    <div className="reschedule">
      <label>
        <span>新承诺取件日（改期须写原因）</span>
        <input
          type="date"
          value={newDate}
          onChange={(e) => {
            setError("");
            setNewDate(e.target.value);
          }}
        />
      </label>
      <label>
        <span>改期原因</span>
        <input
          value={reason}
          placeholder="如：补线材料未到货，客户已知悉"
          onChange={(e) => {
            setError("");
            setReason(e.target.value);
          }}
        />
      </label>
      {error && <p className="inline-error">{error}</p>}
      <div className="row-actions">
        <button type="button" className="primary small" onClick={submit}>
          确认改期
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: StagingOrder;
  today: string;
  onToggleStep: (orderId: string, stepName: string) => void;
  onReschedule: (orderId: string, newDate: string, reason: string) => string;
  onPickup: (orderId: string) => string;
  archived?: boolean;
}

function OrderCard({
  order,
  today,
  onToggleStep,
  onReschedule,
  onPickup,
  archived = false,
}: OrderCardProps) {
  const status = displayStatus(order, today);
  const pct = progressPct(order.steps);
  const late = status === "逾期" ? overdueDays(order, today) : 0;

  return (
    <article className={`order-card ${archived ? "order-archived" : ""}`}>
      <div className="order-head">
        <div>
          <h3>
            {order.carpetNo} <small>{order.id}</small>
          </h3>
          <p className="order-meta">
            {order.origin} · 送修人 {order.sender} · 暂存位 {order.slot}
          </p>
        </div>
        <StatusBadge order={order} today={today} />
      </div>

      <div className="order-dates">
        <span>入店日 {order.inDate}</span>
        <span className={status === "逾期" ? "date-late" : ""}>
          承诺取件日 {order.dueDate}
          {status === "逾期" && `（已逾期 ${late} 天）`}
        </span>
        {archived && order.pickedAt && (
          <span className="date-done">实际取件 {formatDateTime(order.pickedAt)}</span>
        )}
      </div>

      <div className="progress">
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>

      <ul className="steps">
        {order.steps.map((step) => (
          <li key={step.name}>
            <label className={archived ? "step-readonly" : ""}>
              <input
                type="checkbox"
                checked={step.done}
                disabled={archived}
                onChange={() => onToggleStep(order.id, step.name)}
              />
              <span>{step.name}</span>
            </label>
          </li>
        ))}
      </ul>

      {order.history.length > 0 && (
        <div className="history">
          <p>改期历史（{order.history.length}）</p>
          <ul>
            {order.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {h.from} → {h.to} · {h.reason}
                <small>{formatDateTime(h.at)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!archived && (
        <div className="row-actions">
          <RescheduleBox order={order} onSubmit={(d, r) => onReschedule(order.id, d, r)} />
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (window.confirm(`确认 ${order.carpetNo} 已取件？将释放暂存位 ${order.slot}。`)) {
                onPickup(order.id);
              }
            }}
          >
            确认取件并释放暂存位
          </button>
        </div>
      )}
      {archived && <p className="readonly-note">已取件 · 只读记录，暂存位已释放</p>}
    </article>
  );
}

function StagingPage() {
  const { orders, today, intake, toggleStep, reschedule, pickup, metrics } =
    useStagingStore();
  const [originFilter, setOriginFilter] = useState<string>("全部");

  const filtered = useMemo(
    () =>
      orders.filter((o) =>
        originFilter === "全部" ? true : o.origin === originFilter,
      ),
    [orders, originFilter],
  );

  const active = filtered
    .filter((o) => o.status === "在店")
    .sort((a, b) => {
      const sa = displayStatus(a, today) === "逾期" ? 0 : 1;
      const sb = displayStatus(b, today) === "逾期" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.dueDate.localeCompare(b.dueDate);
    });

  const archived = filtered
    .filter((o) => o.status === "已取件")
    .sort((a, b) => (b.pickedAt ?? "").localeCompare(a.pickedAt ?? ""));

  const usedSlots = orders.filter((o) => o.status === "在店").length;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 地毯修复取送暂存台 · Port 62009</p>
        <h1>地毯修复取送暂存台</h1>
        <span>
          登记送修人、承诺取件日、暂存位与修复工序；同毯重复送修、取件日早于入店日、暂存位被占用或工序未完成则整单拒绝。取件后释放暂存位并留只读归档，超期自动标逾期，改期须写原因并保留历史。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在店暂存</small>
          <strong>{metrics.activeCount}</strong>
        </article>
        <article>
          <small>逾期未取</small>
          <strong className={metrics.overdueCount > 0 ? "num-danger" : ""}>
            {metrics.overdueCount}
          </strong>
        </article>
        <article>
          <small>暂存位占用</small>
          <strong>
            {usedSlots}/{STORAGE_SLOTS.length}
          </strong>
        </article>
        <article>
          <small>已取件归档</small>
          <strong>{metrics.archivedCount}</strong>
        </article>
      </section>

      <section className="panel filter-panel">
        <div className="heading">
          <div>
            <p>按产地筛选</p>
            <h2>在店与归档列表</h2>
          </div>
          <span className="hint">今天 {today}</span>
        </div>
        <div className="chips">
          {["全部", ...ORIGINS].map((item) => (
            <button
              key={item}
              type="button"
              className={originFilter === item ? "chip-on" : ""}
              onClick={() => setOriginFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <SlotBoard orders={orders} />
        <IntakeForm today={today} onSubmit={intake} />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>在店修复中</p>
            <h2>暂存列表{originFilter !== "全部" ? ` · ${originFilter}` : ""}</h2>
          </div>
          <span className="hint">{active.length} 单</span>
        </div>
        {active.length === 0 ? (
          <p className="empty">当前筛选下没有在店暂存单。</p>
        ) : (
          <div className="order-list">
            {active.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                today={today}
                onToggleStep={toggleStep}
                onReschedule={reschedule}
                onPickup={pickup}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>取件归档（只读）</p>
            <h2>历史记录{originFilter !== "全部" ? ` · ${originFilter}` : ""}</h2>
          </div>
          <span className="hint">{archived.length} 单</span>
        </div>
        {archived.length === 0 ? (
          <p className="empty">当前筛选下没有取件归档记录。</p>
        ) : (
          <div className="order-list">
            {archived.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                today={today}
                archived
                onToggleStep={toggleStep}
                onReschedule={reschedule}
                onPickup={pickup}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default StagingPage;
