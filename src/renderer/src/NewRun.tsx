import { useState, type CSSProperties } from 'react'
import { Award, Ban, Copy, Crown, Flame, Hand, Layers, Play, ShieldCheck, Skull, Sparkles, Swords, TriangleAlert, Type, X } from 'lucide-react'
import { PRESETS, RESTRICTIONS, type Rules } from '../../shared/run'
import { TYPES, TYPE_COLORS } from './pokemonTypes'

type Preset = Rules['preset']
type Option = readonly [value: unknown, word: string, title: string]
/** Each rule as a tile: an icon, a word, and its settings from most to least strict; the first word-less option is off. */
const TILES: { key: keyof Rules; icon: typeof Award; name: string; options: readonly Option[]; honour?: boolean }[] = [
  { key: 'blackout', icon: Skull, name: 'Wipe', options: [['party', '', 'A party wipe ends the run'], ['box', 'Box', 'The run ends when nothing alive is left'], ['off', '', 'Wipes do not end the run']] },
  { key: 'deathless', icon: Skull, name: 'Deathless', options: [[true, '', 'The first death ends the run'], [false, '', 'Deaths do not end the run']] },
  { key: 'dupes', icon: Copy, name: 'Dupes', options: [['line', 'Line', 'No second of an evolution line'], ['species', 'Species', 'No second of a species'], ['off', '', 'Dupes allowed']] },
  { key: 'shinyClause', icon: Sparkles, name: 'Shiny', options: [[true, '', 'Shinies can always be caught'], [false, '', 'Shinies follow the rules']] },
  { key: 'levelCaps', icon: TriangleAlert, name: 'Caps', options: [['strict', 'Strict', 'Over the next boss’s level breaks the rules'], ['warn', 'Warn', 'Warns over the next boss’s level'], [false, '', 'No level caps']] },
  { key: 'noBattleItems', icon: Ban, name: 'No items', honour: true, options: [[true, '', 'No bag items in battle'], [false, '', 'Bag items allowed in battle']] },
  { key: 'setMode', icon: Swords, name: 'Set', honour: true, options: [[true, '', 'Set battle style'], [false, '', 'Any battle style']] },
  { key: 'nicknames', icon: Type, name: 'Nicknames', honour: true, options: [[true, '', 'Nickname every catch'], [false, '', 'Nicknames optional']] },
  { key: 'typeClause', icon: Layers, name: 'Types', options: [['party', 'Unique', 'No repeated primary type in the team'], ['mono', 'Mono', 'Every catch has the chosen type'], ['off', '', 'Any types']] },
  { key: 'noLegendaries', icon: Crown, name: 'Legends', options: [[true, '', 'No legendary or mythical Pokémon'], [false, '', 'Legendaries allowed']] }
]
const isOff = (v: unknown) => v === false || v === 'off'

/** The rules as tiles: lit when on, with the setting's word; the full rule on hover. Clickable tiles cycle settings. */
function Tiles({ rules, editable, onChange }: { rules: Rules; editable?: (key: keyof Rules) => boolean; onChange?: (key: keyof Rules, value: unknown) => void }) {
  return <ul className="rule-tiles">
    {TILES.map(({ key, icon: Icon, name, options, honour }) => {
      const value = rules[key], at = Math.max(0, options.findIndex(([v]) => v === value)), [, word, title] = options[at]
      const mono = key === 'typeClause' && value === 'mono'
      const can = !!editable?.(key)
      const label = mono ? TYPES[rules.monoType] : word
      return <li key={key} data-on={!isOff(value)} title={mono ? `Only ${TYPES[rules.monoType]} types` : title} style={mono ? { '--tile': TYPE_COLORS[rules.monoType] } as CSSProperties : undefined}>
        <button type="button" disabled={!can} onClick={() => onChange?.(key, options[(at + 1) % options.length][0])} aria-label={`${name}: ${title}`}>
          <Icon size={18}/><b>{name}</b>{label && <em>{label}</em>}
          {honour && !isOff(value) && <Hand className="rule-honour" size={11} aria-label="On your honour"/>}
        </button>
        {mono && can && <select value={rules.monoType} onChange={e => onChange?.('monoType', Number(e.target.value))} aria-label="The one type">
          {TYPES.map((t, i) => <option key={t} value={i}>{t}</option>)}
        </select>}
      </li>
    })}
  </ul>
}

/** The run's rules as tiles, read-only: the setup's summary for the run view and a partner's lobby. */
export function RulesSummary({ rules }: { rules: Rules }) { return <Tiles rules={rules}/> }

/**
 * Starting a run: Classic, Hardcore or your own rules, as Souldew defines them, plus restrictions that sit beside any
 * preset. The two core rules, the first encounter in each area and a fainted Pokémon gone, always apply.
 */
export function NewRun({ game, partner, replacing, onStart, onCancel }: { game: string; partner?: string; replacing?: string; onStart: (rules: Rules) => void; onCancel: () => void }) {
  const [preset, setPreset] = useState<Preset>('classic')
  const [custom, setCustom] = useState<Omit<Rules, 'preset'>>(PRESETS.classic)
  const [limits, setLimits] = useState<Pick<Rules, typeof RESTRICTIONS[number]>>({ typeClause: 'off', monoType: 0, noLegendaries: false })
  const rules: Rules = { ...(preset === 'custom' ? { preset, ...custom } : { preset, ...PRESETS[preset] }), ...limits }
  const restriction = (key: keyof Rules) => (RESTRICTIONS as readonly string[]).includes(key)
  return <section className="new-run" aria-label="New run">
    <header>
      <h2>Pokémon {game}{partner ? ` · ${partner}` : ''}</h2>
      <button className="island-icon" onClick={onCancel} aria-label="Cancel"><X size={16}/></button>
    </header>
    <div className="new-run-presets" role="radiogroup" aria-label="Rules">
      {([['classic', ShieldCheck, 'Classic'], ['hardcore', Flame, 'Hardcore'], ['custom', Award, 'Custom']] as const).map(([id, Icon, name]) =>
        <button key={id} role="radio" aria-checked={preset === id} onClick={() => setPreset(id)}><Icon size={20}/>{name}</button>)}
    </div>
    <Tiles rules={rules} editable={key => preset === 'custom' || restriction(key)}
      onChange={(key, value) => restriction(key) ? setLimits({ ...limits, [key]: value }) : setCustom({ ...custom, [key]: value })}/>
    <div className="island-actions">
      <button className="island-play" data-confirm onClick={() => onStart(rules)}><Play size={16}/>Start run</button>
    </div>
  </section>
}
