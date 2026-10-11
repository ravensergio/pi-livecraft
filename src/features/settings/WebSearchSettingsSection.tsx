import { useCallback, useEffect, useState } from 'react'

const ENGINES = [
  { name: 'duckduckgo', label: 'DuckDuckGo', hint: 'On by default.' },
  { name: 'startpage', label: 'Startpage', hint: 'On by default. Google-backed index.' },
  { name: 'yandex', label: 'Yandex', hint: 'Opt-in.' },
  { name: 'brave', label: 'Brave', hint: 'Opt-in. Needs the Lightpanda fallback.' },
  { name: 'yahoo', label: 'Yahoo', hint: 'Opt-in. Needs the Lightpanda fallback.' },
] as const

const RENDER_ONLY = new Set<string>(['brave', 'yahoo'])

interface SearchConfig {
  engines: string[]
  lightpandaFallback: boolean
}

/** Web search engines + Lightpanda fallback — mirrors the TUI's /search-config
 * (pi-unsloth-webtools); both edit the same pi agent settings.json. */
export function WebSearchSettingsSection() {
  const [config, setConfig] = useState<SearchConfig | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/search-config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setConfig)
      .catch((cause) => setError(String(cause)))
  }, [])

  const save = useCallback(async (next: SearchConfig) => {
    setConfig(next)
    try {
      const res = await fetch('/api/search-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }, [])

  if (error)
    return (
      <section>
        <p>Search settings unavailable: {error}</p>
      </section>
    )
  if (!config)
    return (
      <section>
        <p>Loading search settings…</p>
      </section>
    )

  const toggleEngine = (name: string, on: boolean) => {
    let engines = on ? [...config.engines, name] : config.engines.filter((e) => e !== name)
    if (!on && engines.length === 0) return // at least one engine stays on
    let fallback = config.lightpandaFallback
    if (on && RENDER_ONLY.has(name)) fallback = true
    if (!fallback) engines = engines.filter((e) => !RENDER_ONLY.has(e))
    void save({ engines, lightpandaFallback: fallback })
  }

  const toggleFallback = (on: boolean) => {
    let engines = on ? config.engines : config.engines.filter((e) => !RENDER_ONLY.has(e))
    if (engines.length === 0) engines = ['duckduckgo', 'startpage']
    void save({ engines, lightpandaFallback: on })
  }

  return (
    <section>
      <p>
        Engines used by the web_search sweep. Saved to the pi agent settings — the TUI's
        /search-config edits the same file.
      </p>
      {ENGINES.map((engine) => (
        <label className='voice-row' key={engine.name}>
          <input
            checked={config.engines.includes(engine.name)}
            onChange={(event) => toggleEngine(engine.name, event.target.checked)}
            type='checkbox'
          />
          <span>{engine.label}</span>
          <small>{engine.hint}</small>
        </label>
      ))}
      {config
        .engines
        .filter((name) => !ENGINES.some((engine) => engine.name === name))
        .map((name) => (
          <label className='voice-row' key={name}>
            <input
              checked={config.engines.includes(name)}
              onChange={(event) => toggleEngine(name, event.target.checked)}
              type='checkbox'
            />
            <span>{name}</span>
            <small>Added by the extension — kept on save.</small>
          </label>
        ))}
      <label className='voice-row'>
        <input
          checked={config.lightpandaFallback}
          onChange={(event) => toggleFallback(event.target.checked)}
          type='checkbox'
        />
        <span>Lightpanda fallback</span>
        <small>
          Render engine pages locally when the network returns nothing; required for Brave and
          Yahoo.
        </small>
      </label>
    </section>
  )
}
