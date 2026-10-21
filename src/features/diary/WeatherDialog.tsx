import { useState } from 'react'
import { WEATHER_PRESETS, joinWeather, parseWeather, weatherIcon } from './weather'
import {
  fetchDayWeather,
  loadWeatherPlace,
  locatePlace,
  saveWeatherPlace,
  searchPlaces,
} from './weatherQuery'
import type { DayWeather, WeatherPlace } from './weatherQuery'
import Modal from '../../shared/ui/Modal'

type Busy = 'idle' | 'locating' | 'querying'

export default function WeatherDialog({
  dateKey,
  value,
  onConfirm,
  onCancel,
}: {
  /** 查的是哪一天，格式 YYYY-MM-DD */
  dateKey: string
  value: string
  onConfirm: (weather: string) => void
  onCancel: () => void
}) {
  const [states, setStates] = useState<string[]>(() => parseWeather(value))
  const [place, setPlace] = useState<WeatherPlace | null>(loadWeatherPlace)
  const [busy, setBusy] = useState<Busy>('idle')
  const [candidate, setCandidate] = useState<DayWeather | null>(null)
  const [queryError, setQueryError] = useState('')
  const [cityOpen, setCityOpen] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<WeatherPlace[]>([])
  const [cityBusy, setCityBusy] = useState(false)
  const [cityError, setCityError] = useState('')
  const [citySearched, setCitySearched] = useState(false)

  /** 地点定了之后只负责查，不再碰地点 */
  async function queryWith(target: WeatherPlace) {
    setBusy('querying')
    setQueryError('')
    try {
      setCandidate(await fetchDayWeather(dateKey, target))
    } catch (error) {
      setQueryError((error as Error).message)
    } finally {
      setBusy('idle')
    }
  }

  /** 点「查天气」：没地点就先定位，定位不成直接引导去搜城市 */
  async function handleQuery() {
    setCandidate(null)
    setQueryError('')
    let target = place
    if (!target) {
      setBusy('locating')
      try {
        target = await locatePlace()
      } catch (error) {
        setBusy('idle')
        setQueryError((error as Error).message)
        setCityOpen(true)
        return
      }
      saveWeatherPlace(target)
      setPlace(target)
    }
    await queryWith(target)
  }

  async function handleCitySearch() {
    setCityBusy(true)
    setCityError('')
    setCityResults([])
    setCitySearched(false)
    try {
      setCityResults(await searchPlaces(cityQuery))
      setCitySearched(true)
    } catch (error) {
      setCityError((error as Error).message)
    } finally {
      setCityBusy(false)
    }
  }

  /** 选定城市就记下来，并顺手用新地点查一次 */
  function chooseCity(next: WeatherPlace) {
    saveWeatherPlace(next)
    setPlace(next)
    setCityOpen(false)
    setCityQuery('')
    setCityResults([])
    setCityError('')
    setCitySearched(false)
    setCandidate(null)
    void queryWith(next)
  }

  /** 查到之后要不要留：点「填上」才写进上面的天气链，点「不用」什么都不动 */
  function applyCandidate() {
    if (!candidate) return
    setStates([candidate.state])
    setCandidate(null)
  }

  return (
    <Modal size="xs" onClose={onCancel}>
      <div className="text-sm font-medium">天气</div>

      {/* 上面是已经排好的链条：点标签上的 ✕ 永远是删掉这一个 */}
      <div className="mt-3 min-h-11 rounded-lg border border-line bg-surface-2 px-3 py-2">
        {states.length === 0 ? (
          <span className="text-xs text-muted">还没选，下面点一下加一个</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {states.map((state, index) => (
              <span
                key={`${state}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-brand px-2 py-0.5 text-xs text-brand"
              >
                <span aria-hidden="true">{weatherIcon(state) || '·'}</span>
                {state}
                <button
                  type="button"
                  onClick={() => setStates(states.filter((_, i) => i !== index))}
                  title="删掉这一个"
                  className="ml-0.5 text-muted transition-colors hover:text-danger"
                >
                  <span aria-hidden="true">✕</span>
                  <span className="sr-only">删掉{state}</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 下面是天气按钮：点一下永远是追加到末尾 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {WEATHER_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setStates([...states, preset])}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <span aria-hidden="true">{weatherIcon(preset)}</span> {preset}
          </button>
        ))}
      </div>

      {/* 查天气：地点、结果、换城市都收在这一块，结果要不要留由用户点 */}
      <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-muted" title={place?.label}>
            {place ? `查天气的地点：${place.label}` : '还没定查天气的地点'}
          </span>
          <button
            type="button"
            onClick={() => setCityOpen((open) => !open)}
            className="shrink-0 text-brand transition-opacity hover:opacity-80"
          >
            {cityOpen ? '收起' : '换地点'}
          </button>
        </div>

        {cityOpen && (
          <div className="mt-2">
            <div className="flex gap-1.5">
              <input
                value={cityQuery}
                spellCheck={false}
                placeholder="搜一个城市，比如 杭州"
                aria-label="城市名"
                onChange={(event) => setCityQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCitySearch()
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-fg outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={cityBusy || cityQuery.trim() === ''}
                onClick={() => void handleCitySearch()}
                className="shrink-0 rounded-md border border-line px-2 py-1.5 text-muted transition-colors hover:text-fg disabled:opacity-40"
              >
                {cityBusy ? '搜索中…' : '搜索'}
              </button>
            </div>

            {cityError && <p className="mt-1.5 text-danger">{cityError}</p>}

            {cityResults.length > 0 && (
              <div className="mt-1.5 max-h-36 overflow-auto rounded-md border border-line bg-surface py-1">
                {cityResults.map((item) => (
                  <button
                    key={`${item.lat},${item.lon},${item.label}`}
                    type="button"
                    onClick={() => chooseCity(item)}
                    className="block w-full truncate px-2 py-1.5 text-left text-fg transition-colors hover:bg-surface-2"
                  >
                    📍 {item.label}
                  </button>
                ))}
              </div>
            )}

            {citySearched && cityResults.length === 0 && !cityError && (
              <p className="mt-1.5 text-muted">没搜到这个地名，换个写法再试（比如加上省份）。</p>
            )}
          </div>
        )}

        {busy !== 'idle' && (
          <p className="mt-2 text-muted">{busy === 'locating' ? '正在定位…' : '正在查这天的天气…'}</p>
        )}

        {queryError && <p className="mt-2 text-danger">{queryError}</p>}

        {candidate && (
          <div className="mt-2 rounded-md border border-brand/40 bg-surface px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-fg">
                查到：{weatherIcon(candidate.state) || '·'} {candidate.state}
              </span>
              <button
                type="button"
                onClick={applyCandidate}
                className="text-brand transition-opacity hover:opacity-80"
              >
                填上
              </button>
              <button
                type="button"
                onClick={() => setCandidate(null)}
                className="text-muted transition-colors hover:text-fg"
              >
                不用
              </button>
            </div>
            {states.length > 0 && (
              <p className="mt-1 text-muted">「填上」会替换上面已经选好的天气。</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy !== 'idle'}
          onClick={() => void handleQuery()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg disabled:opacity-40"
        >
          查天气
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onConfirm(joinWeather(states))}
          className="rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
        >
          确认
        </button>
      </div>
    </Modal>
  )
}
