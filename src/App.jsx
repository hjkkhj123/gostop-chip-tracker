import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'gostop-chip-tracker-v1';
const DEFAULT_PLAYERS = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4'];
const DEFAULT_CHIPS = 100;
const EMPTY_TRANSFER_FORM = {
  from: '',
  to: '',
  amount: '',
};

function createInitialState() {
  return {
    players: DEFAULT_PLAYERS.map((name, index) => ({ id: String(index + 1), name })),
    initialChips: DEFAULT_CHIPS,
    transfers: [],
    isStarted: false,
  };
}

function formatTime(value) {
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizePlayers(players) {
  if (!Array.isArray(players)) {
    return createInitialState().players;
  }

  const normalized = players
    .map((player, index) => {
      const name = typeof player?.name === 'string' ? player.name.trim() : '';
      const id = typeof player?.id === 'string' && player.id ? player.id : `player-${index + 1}`;

      return {
        id,
        name: name || `플레이어 ${index + 1}`,
      };
    })
    .filter((player, index, list) => {
      return list.findIndex((candidate) => candidate.id === player.id) === index;
    })
    .slice(0, 4);

  if (normalized.length < 3) {
    return createInitialState().players;
  }

  return normalized;
}

function normalizeTransfers(transfers, playerIds) {
  if (!Array.isArray(transfers)) {
    return [];
  }

  return transfers
    .map((transfer) => {
      const amount = Number(transfer?.amount);
      const from = typeof transfer?.from === 'string' ? transfer.from : transfer?.fromPlayerId;
      const to = typeof transfer?.to === 'string' ? transfer.to : transfer?.toPlayerId;

      if (
        !playerIds.has(from) ||
        !playerIds.has(to) ||
        from === to ||
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return null;
      }

      return {
        id: typeof transfer?.id === 'string' && transfer.id ? transfer.id : crypto.randomUUID(),
        from,
        to,
        amount,
        createdAt: Number(transfer?.createdAt) || Date.now(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getNextTransferForm(players, currentForm = EMPTY_TRANSFER_FORM) {
  const [first, second = first] = players;
  const ids = new Set(players.map((player) => player.id));
  const from = ids.has(currentForm.from) ? currentForm.from : first?.id ?? '';
  let to = ids.has(currentForm.to) ? currentForm.to : second?.id ?? first?.id ?? '';

  if (from && from === to) {
    to = players.find((player) => player.id !== from)?.id ?? '';
  }

  return {
    from,
    to,
    amount: currentForm.amount ?? '',
  };
}

function loadInitialState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return createInitialState();

    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.transfers)) {
      return createInitialState();
    }

    const players = normalizePlayers(parsed.players);
    const playerIds = new Set(players.map((player) => player.id));

    return {
      players,
      initialChips: Number(parsed.initialChips) > 0 ? Math.floor(Number(parsed.initialChips)) : DEFAULT_CHIPS,
      transfers: normalizeTransfers(parsed.transfers, playerIds),
      isStarted: Boolean(parsed.isStarted),
    };
  } catch {
    return createInitialState();
  }
}

export default function App() {
  const [state, setState] = useState(loadInitialState);
  const [initialChipsInput, setInitialChipsInput] = useState(() => String(loadInitialState().initialChips));
  const [transferForm, setTransferForm] = useState(() => getNextTransferForm(loadInitialState().players));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures and keep the UI usable
    }
  }, [state]);

  useEffect(() => {
    setTransferForm((prev) => getNextTransferForm(state.players, prev));
  }, [state.players]);

  useEffect(() => {
    setInitialChipsInput(String(state.initialChips));
  }, [state.initialChips]);

  const balances = useMemo(() => {
    const map = Object.fromEntries(state.players.map((player) => [player.id, state.initialChips]));

    for (const transfer of state.transfers) {
      map[transfer.from] -= transfer.amount;
      map[transfer.to] += transfer.amount;
    }

    return map;
  }, [state]);

  const parsedInitialChipsInput = Math.floor(Number(initialChipsInput));
  const setupInitialChips = Number.isFinite(parsedInitialChipsInput) && parsedInitialChipsInput > 0
    ? parsedInitialChipsInput
    : state.initialChips;
  const totalChips = state.players.length * (state.isStarted ? state.initialChips : setupInitialChips);

  const ranking = useMemo(() => {
    return [...state.players].sort((a, b) => balances[b.id] - balances[a.id]);
  }, [state.players, balances]);

  function updatePlayerName(id, name) {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((player) =>
        player.id === id ? { ...player, name } : player
      ),
    }));
  }

  function commitInitialChipsInput() {
    const parsed = Math.floor(Number(initialChipsInput));

    if (!Number.isFinite(parsed) || parsed < 1) {
      setInitialChipsInput(String(state.initialChips));
      return state.initialChips;
    }

    setState((prev) => ({
      ...prev,
      initialChips: parsed,
    }));

    return parsed;
  }

  function removePlayer(id) {
    if (state.players.length <= 3) return;

    setState((prev) => ({
      ...prev,
      players: prev.players.filter((player) => player.id !== id),
      transfers: prev.transfers.filter(
        (transfer) => transfer.from !== id && transfer.to !== id
      ),
    }));

  }

  function addTransfer(event) {
    event.preventDefault();
    const amount = Number(transferForm.amount);
    const senderBalance = balances[transferForm.from] ?? 0;

    if (!transferForm.from || !transferForm.to || transferForm.from === transferForm.to) return;
    if (!Number.isInteger(amount) || amount <= 0) return;
    if (amount > senderBalance) return;

    setState((prev) => ({
      ...prev,
      transfers: [
        {
          id: crypto.randomUUID(),
          from: transferForm.from,
          to: transferForm.to,
          amount,
          createdAt: Date.now(),
        },
        ...prev.transfers,
      ],
    }));

    setTransferForm((prev) => ({ ...prev, amount: '' }));
  }

  function startGame() {
    const nextInitialChips = commitInitialChipsInput();

    setState((prev) => ({
      ...prev,
      players: prev.players.map((player, index) => ({
        ...player,
        name: player.name.trim() || `플레이어 ${index + 1}`,
      })),
      initialChips: nextInitialChips,
      isStarted: true,
    }));
  }

  function returnToSetup() {
    setState((prev) => ({
      ...prev,
      isStarted: false,
    }));
  }

  function deleteTransfer(id) {
    setState((prev) => ({
      ...prev,
      transfers: prev.transfers.filter((transfer) => transfer.id !== id),
    }));
  }

  function resetGame() {
    const nextState = createInitialState();
    setState(nextState);
    setInitialChipsInput(String(nextState.initialChips));
    setTransferForm(getNextTransferForm(nextState.players));
  }

  return (
    <div className="app">
      <header className="header card">
        <div>
          <p className="eyebrow">고스톱 칩 트래커</p>
          <h1>{state.isStarted ? '진행 중인 칩 현황' : '게임 시작 전 설정'}</h1>
        </div>
        <div className="header-actions">
          {state.isStarted && (
            <button className="ghost" onClick={returnToSetup}>설정으로</button>
          )}
          <button className="ghost" onClick={resetGame}>초기화</button>
        </div>
      </header>

      {!state.isStarted ? (
        <section className="card grid-two">
          <div>
            <h2>게임 설정</h2>
            <label className="field">
              <span>시작 칩</span>
              <input
                type="number"
                min="1"
                value={initialChipsInput}
                onChange={(e) => setInitialChipsInput(e.target.value)}
                onBlur={commitInitialChipsInput}
              />
            </label>
            <p className="caption">전체 칩 합계: {totalChips}</p>
          </div>

          <div>
            <h2>플레이어</h2>
            <div className="player-list">
              {state.players.map((player) => (
                <div key={player.id} className="player-row">
                  <input
                    value={player.name}
                    onChange={(e) => updatePlayerName(player.id, e.target.value)}
                  />
                  <strong>{initialChipsInput || '-'}</strong>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => removePlayer(player.id)}
                    disabled={state.players.length <= 3}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="start-button" onClick={startGame}>게임 시작</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="status-strip">
              <div>
                <p className="caption">플레이어</p>
                <strong>{state.players.length}명</strong>
              </div>
              <div>
                <p className="caption">시작 칩</p>
                <strong>{state.initialChips}</strong>
              </div>
              <div>
                <p className="caption">전체 칩</p>
                <strong>{totalChips}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>칩 주고받기</h2>
            <form className="transfer-form" onSubmit={addTransfer}>
              <label className="field">
                <span>보내는 사람</span>
                <select
                  value={transferForm.from}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, from: e.target.value }))}
                >
                  {state.players.map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>받는 사람</span>
                <select
                  value={transferForm.to}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, to: e.target.value }))}
                >
                  {state.players.map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>칩 수</span>
                <input
                  type="number"
                  min="1"
                  max={balances[transferForm.from] ?? undefined}
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="예: 3"
                />
              </label>

              <button type="submit">기록</button>
            </form>
            <p className="caption">보내는 사람은 현재 보유 칩 이하로만 입력할 수 있습니다.</p>
          </section>

          <section className="grid-two">
            <div className="card">
              <h2>현재 칩 현황</h2>
              <div className="ranking-list">
                {ranking.map((player, index) => (
                  <div key={player.id} className="ranking-row">
                    <span>{index + 1}</span>
                    <span>{player.name}</span>
                    <strong>{balances[player.id]}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>최근 이동 내역</h2>
              <div className="history-list">
                {state.transfers.length === 0 && <p className="caption">아직 기록이 없습니다.</p>}
                {state.transfers.map((transfer) => {
                  const from = state.players.find((player) => player.id === transfer.from)?.name ?? '알 수 없음';
                  const to = state.players.find((player) => player.id === transfer.to)?.name ?? '알 수 없음';

                  return (
                    <div key={transfer.id} className="history-row">
                      <div>
                        <strong>{transfer.amount}</strong>
                        <span>{from} → {to}</span>
                      </div>
                      <div className="history-actions">
                        <small>{formatTime(transfer.createdAt)}</small>
                        <button className="ghost small" onClick={() => deleteTransfer(transfer.id)}>삭제</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
