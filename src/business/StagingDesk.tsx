import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ORIGINS,
  PRESET_PROCESSES,
  RepairOrder,
  STORAGE_SLOTS,
  activeOrders,
  formatDateTime,
  orderStatus,
  progressOf,
  todayStr,
  validateReschedule,
} from "./rules";
import {
  checkInOrder,
  getOrders,
  pickUpOrder,
  resetToSeed,
  rescheduleOrder,
  subscribe,
  toggleProcess,
} from "./state";

function useOrders(): RepairOrder[] {
  const [orders, setOrders] = useState<RepairOrder[]>(getOrders);
  useEffect(() => subscribe(() => setOrders([...getOrders()])), []);
  return orders;
}

type FormMessage =
  | { type: "reject"; messages: string[] }
  | { type: "success"; text: string }
  | null;

function CheckInForm({ orders }: { orders: RepairOrder[] }) {
  const active = activeOrders(orders);
  const occupied = new Set(active.map((order) => order.slot));
  const today = todayStr();

  const [carpetNo, setCarpetNo] = useState("");
  const [origin, setOrigin] = useState(ORIGINS[0]);
  const [sender, setSender] = useState("");
  const [slot, setSlot] = useState("");
  const [checkInDate, setCheckInDate] = useState(today);
  const [promisedDate, setPromisedDate] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [customProcess, setCustomProcess] = useState("");
  const [message, setMessage] = useState<FormMessage>(null);

  const toggleProcessName = (name: string) => {
    setMessage(null);
    setSelectedProcesses((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const addCustomProcess = () => {
    const name = customProcess.trim();
    if (!name || selectedProcesses.includes(name)) {
      setCustomProcess("");
      return;
    }
    setSelectedProcesses((prev) => [...prev, name]);
    setCustomProcess("");
  };

  const reset = () => {
    setCarpetNo("");
    setOrigin(ORIGINS[0]);
    setSender("");
    setSlot("");
    setCheckInDate(today);
    setPromisedDate("");
    setSelectedProcesses([]);
    setCustomProcess("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = checkInOrder({
      carpetNo,
      origin,
      sender,
      slot,
      checkInDate,
      promisedDate,
      processes: selectedProcesses,
    });
    if (!result.ok) {
      // 整单拒绝：列表、暂存位与进度均不变
      setMessage({
        type: "reject",
        messages: result.errors.map((error) => error.message),
      });
      return;
    }
    setMessage({
      type: "success",
      text: `登记成功：${result.order!.id} · ${result.order!.carpetNo} 已暂存于 ${result.order!.slot}`,
    });
    reset();
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>到店登记</p>
          <h2>新增送修工单</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field-grid">
          <label>
            <span>毯号（同毯在店不可重复送修）</span>
            <input
              value={carpetNo}
              onChange={(event) => {
                setCarpetNo(event.target.value);
                setMessage(null);
              }}
              placeholder="如 CAR-201"
              required
            />
          </label>
          <label>
            <span>产地</span>
            <select value={origin} onChange={(event) => setOrigin(event.target.value)}>
              {ORIGINS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>送修人</span>
            <input
              value={sender}
              onChange={(event) => {
                setSender(event.target.value);
                setMessage(null);
              }}
              placeholder="登记送修人姓名"
              required
            />
          </label>
          <label>
            <span>暂存位</span>
            <select value={slot} onChange={(event) => { setSlot(event.target.value); setMessage(null); }} required>
              <option value="" disabled>
                选择空闲暂存位
              </option>
              {STORAGE_SLOTS.map((item) => (
                <option key={item} value={item} disabled={occupied.has(item)}>
                  {item}
                  {occupied.has(item) ? "（已占用）" : "（空闲）"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>入店日</span>
            <input
              type="date"
              value={checkInDate}
              onChange={(event) => {
                setCheckInDate(event.target.value);
                setMessage(null);
              }}
              required
            />
          </label>
          <label>
            <span>承诺取件日（早于入店日将整单拒绝）</span>
            <input
              type="date"
              value={promisedDate}
              min={checkInDate}
              onChange={(event) => {
                setPromisedDate(event.target.value);
                setMessage(null);
              }}
              required
            />
          </label>
        </div>

        <div className="process-block">
          <span className="field-label">修复工序（至少登记一道，否则整单拒绝）</span>
          <div className="process-picker">
            {PRESET_PROCESSES.map((name) => (
              <button
                type="button"
                key={name}
                className={selectedProcesses.includes(name) ? "picked" : ""}
                onClick={() => toggleProcessName(name)}
              >
                {selectedProcesses.includes(name) ? "✓ " : ""}
                {name}
              </button>
            ))}
            {selectedProcesses
              .filter((name) => !PRESET_PROCESSES.includes(name))
              .map((name) => (
                <button type="button" key={name} className="picked" onClick={() => toggleProcessName(name)}>
                  ✓ {name}
                </button>
              ))}
          </div>
          <div className="custom-process">
            <input
              value={customProcess}
              onChange={(event) => setCustomProcess(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomProcess();
                }
              }}
              placeholder="自定义工序，回车添加"
            />
            <button type="button" onClick={addCustomProcess}>
              添加
            </button>
          </div>
        </div>

        {message?.type === "reject" && (
          <div className="alert reject" role="alert">
            <b>整单拒绝，未写入任何数据：</b>
            <ul>
              {message.messages.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        )}
        {message?.type === "success" && (
          <div className="alert success" role="status">
            {message.text}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="ghost" onClick={reset}>
            清空
          </button>
          <button type="submit" className="primary">
            登记到店
          </button>
        </div>
      </form>
    </section>
  );
}

function RescheduleEditor({ order }: { order: RepairOrder }) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="ghost small" onClick={() => setOpen(true)}>
        申请改期
      </button>
    );
  }

  const submit = () => {
    const invalid = validateReschedule(order, newDate, reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    rescheduleOrder(order.id, newDate, reason);
    setOpen(false);
    setNewDate("");
    setReason("");
    setError(null);
  };

  return (
    <div className="reschedule">
      <label>
        <span>新承诺取件日</span>
        <input type="date" min={order.checkInDate} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
      </label>
      <label>
        <span>改期原因（必填，将写入历史）</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：补线色号需重新调配" />
      </label>
      {error && <p className="inline-error">{error}</p>}
      <div className="reschedule-actions">
        <button
          className="ghost small"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          取消
        </button>
        <button className="primary small" onClick={submit}>
          确认改期
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ order }: { order: RepairOrder }) {
  const status = orderStatus(order);
  const label =
    status === "picked" ? "已取件" : status === "overdue" ? "逾期" : "在店";
  return <span className={`badge ${status}`}>{label}</span>;
}

function HistoryBlock({ order }: { order: RepairOrder }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="history">
      <button type="button" className="linklike" onClick={() => setExpanded((v) => !v)}>
        改期历史（{order.history.length} 条）{expanded ? " ▲" : " ▼"}
      </button>
      {expanded &&
        (order.history.length === 0 ? (
          <p className="panel-hint">暂无改期记录</p>
        ) : (
          <ol>
            {[...order.history].reverse().map((entry, index) => (
              <li key={entry.at + index}>
                <b>
                  {entry.from} → {entry.to}
                </b>
                <span>{formatDateTime(entry.at)} 登记</span>
                <p>原因：{entry.reason}</p>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}

function OrderCard({ order }: { order: RepairOrder }) {
  const progress = progressOf(order);
  const status = orderStatus(order);
  const allDone = progress.done === progress.total;

  const handlePickup = () => {
    const warning = allDone
      ? `确认 ${order.carpetNo} 已取件？取件后将释放暂存位 ${order.slot}，记录转为只读。`
      : `工序尚未全部完成（${progress.done}/${progress.total}）。仍确认取件？取件后释放暂存位 ${order.slot} 并转为只读记录。`;
    if (window.confirm(warning)) pickUpOrder(order.id);
  };

  return (
    <article className={`order-card ${status}`}>
      <div className="order-head">
        <div>
          <h3>
            {order.carpetNo}
            <StatusBadge order={order} />
          </h3>
          <p className="order-meta">
            {order.id} · {order.origin} · 送修人 {order.sender} · 暂存位 {order.slot}
          </p>
        </div>
        <div className="order-dates">
          <span>入店 {order.checkInDate}</span>
          <span className={status === "overdue" ? "date-overdue" : ""}>
            承诺取件 {order.promisedDate}
            {status === "overdue" && "（已超期）"}
          </span>
        </div>
      </div>

      <div className="progress-row">
        <div className="progress-bar">
          <i style={{ width: `${progress.percent}%` }} />
        </div>
        <span>
          工序 {progress.done}/{progress.total} · {progress.percent}%
        </span>
      </div>

      <ul className="process-list">
        {order.processes.map((step) => (
          <li key={step.id}>
            <label>
              <input
                type="checkbox"
                checked={step.done}
                onChange={() => toggleProcess(order.id, step.id)}
              />
              <span className={step.done ? "done" : ""}>{step.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <HistoryBlock order={order} />

      <div className="card-actions">
        <RescheduleEditor order={order} />
        <button className="primary small" onClick={handlePickup}>
          办理取件
        </button>
      </div>
    </article>
  );
}

function PickedRecord({ order }: { order: RepairOrder }) {
  const progress = progressOf(order);
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="order-card picked-record">
      <div className="order-head">
        <div>
          <h3>
            {order.carpetNo}
            <StatusBadge order={order} />
          </h3>
          <p className="order-meta">
            {order.id} · {order.origin} · 送修人 {order.sender}
            {order.pickedUpAt && ` · 取件于 ${formatDateTime(order.pickedUpAt)}`}
          </p>
        </div>
        <div className="order-dates">
          <span>入店 {order.checkInDate}</span>
          <span>承诺取件 {order.promisedDate}</span>
          <span>工序 {progress.done}/{progress.total}</span>
        </div>
      </div>
      <div className="readonly-note">暂存位已释放，本记录只读，不可再改期或更新工序。</div>
      {order.history.length > 0 && (
        <div className="history">
          <button type="button" className="linklike" onClick={() => setExpanded((v) => !v)}>
            改期历史（{order.history.length} 条）{expanded ? " ▲" : " ▼"}
          </button>
          {expanded && (
            <ol>
              {[...order.history].reverse().map((entry, index) => (
                <li key={entry.at + index}>
                  <b>
                    {entry.from} → {entry.to}
                  </b>
                  <span>{formatDateTime(entry.at)} 登记</span>
                  <p>原因：{entry.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function StagingDesk() {
  const orders = useOrders();
  const [originFilter, setOriginFilter] = useState<string>("全部产地");

  const active = useMemo(
    () =>
      activeOrders(orders)
        .filter((order) => originFilter === "全部产地" || order.origin === originFilter),
    [orders, originFilter]
  );
  const picked = useMemo(
    () =>
      orders
        .filter((order) => order.pickedUp)
        .filter((order) => originFilter === "全部产地" || order.origin === originFilter),
    [orders, originFilter]
  );

  const overdueCount = activeOrders(orders).filter(
    (order) => orderStatus(order) === "overdue"
  ).length;
  const occupiedCount = activeOrders(orders).length;
  const freeSlots = STORAGE_SLOTS.length - occupiedCount;
  const inProgress = activeOrders(orders).reduce(
    (sum, order) => sum + progressOf(order).done,
    0
  );
  const totalProcesses = activeOrders(orders).reduce(
    (sum, order) => sum + progressOf(order).total,
    0
  );

  return (
    <main className="app">
      <section className="hero">
        <p>RP-STAGING · 手工地毯修复工作室</p>
        <h1>地毯取送暂存台</h1>
        <span>
          登记送修人、承诺取件日、暂存位与修复工序，按产地筛查看管在店地毯。到店须通过同毯重复送修、取件日期、暂存位占用与工序登记四项校验；
          取件释放暂存位并留存只读档案，超期自动标逾期，改期须写原因并保留历史。数据保存在本浏览器。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在店地毯</small>
          <strong>{occupiedCount}</strong>
        </article>
        <article>
          <small>逾期待取</small>
          <strong>{overdueCount}</strong>
        </article>
        <article>
          <small>空闲暂存位</small>
          <strong>{freeSlots}</strong>
        </article>
        <article>
          <small>在店工序进度</small>
          <strong>
            {inProgress}
            <em>/{totalProcesses}</em>
          </strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>按产地筛选</h2>
          <div className="chips">
            {["全部产地", ...ORIGINS].map((item) => (
              <button
                key={item}
                className={originFilter === item ? "active" : ""}
                onClick={() => setOriginFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="reset-line">
            <button className="linklike" onClick={resetToSeed}>
              恢复演示数据
            </button>
          </div>
          <SlotBoardInline orders={orders} />
        </aside>

        <CheckInForm orders={orders} />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>暂存台看板</p>
            <h2>
              在店工单{originFilter !== "全部产地" ? ` · ${originFilter}` : ""}
              <span className="count-tag">{active.length}</span>
            </h2>
          </div>
        </div>
        {active.length === 0 ? (
          <p className="panel-hint">当前筛选下暂无在店工单。</p>
        ) : (
          <div className="order-grid">
            {active.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      <section className="panel archive-panel">
        <div className="heading">
          <div>
            <p>取件档案（只读）</p>
            <h2>
              已取件记录
              <span className="count-tag">{picked.length}</span>
            </h2>
          </div>
        </div>
        {picked.length === 0 ? (
          <p className="panel-hint">当前筛选下暂无取件记录。</p>
        ) : (
          <div className="order-grid">
            {picked.map((order) => (
              <PickedRecord key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// 侧边栏暂存位：直接复用 SlotBoard 的面板样式不便嵌套，薄封装一层
function SlotBoardInline({ orders }: { orders: RepairOrder[] }) {
  const used = new Map(
    activeOrders(orders).map((order) => [order.slot, order.carpetNo])
  );
  return (
    <div className="slot-side">
      <h3>暂存位状态</h3>
      <div className="slot-grid compact">
        {STORAGE_SLOTS.map((slot) => {
          const carpetNo = used.get(slot);
          return (
            <div key={slot} className={carpetNo ? "slot busy" : "slot free"}>
              <b>{slot}</b>
              <span>{carpetNo ?? "空"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StagingDesk;
