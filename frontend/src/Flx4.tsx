import { cx } from "./ui";

/** Schematische Draufsicht des DDJ-FLX4. `active` = Kennungen der hervorzuhebenden Bedienelemente. */
export function Flx4({ active }: { active: string[] }) {
  const on = (id: string) => active.includes(id);
  const cls = (id: string) => cx("flx", on(id) && "flx-on");

  const Knob = ({ id, x, y, label, r = 13 }: { id: string; x: number; y: number; label: string; r?: number }) => (
    <g className={cls(id)}>
      <circle cx={x} cy={y} r={r} className="flx-shape" />
      <line x1={x} y1={y - r + 3} x2={x} y2={y - 3} className="flx-mark" />
      <text x={x} y={y + r + 11} className="flx-label">{label}</text>
    </g>
  );
  const Btn = ({ id, x, y, w, h = 18, label, round }: { id: string; x: number; y: number; w: number; h?: number; label: string; round?: boolean }) => (
    <g className={cls(id)}>
      <rect x={x} y={y} width={w} height={h} rx={round ? h / 2 : 4} className="flx-shape" />
      <text x={x + w / 2} y={y + h / 2 + 3} className="flx-label flx-in">{label}</text>
    </g>
  );
  const Fader = ({ id, x, y, h, label }: { id: string; x: number; y: number; h: number; label: string }) => (
    <g className={cls(id)}>
      <rect x={x - 2} y={y} width={4} height={h} rx={2} className="flx-track" />
      <rect x={x - 11} y={y + h * 0.55} width={22} height={12} rx={3} className="flx-shape" />
      <text x={x} y={y + h + 13} className="flx-label">{label}</text>
    </g>
  );

  const Deck = ({ n, ox }: { n: 1 | 2; ox: number }) => (
    <g>
      <rect x={ox} y={12} width={330} height={396} rx={14} className="flx-panel" />
      <text x={ox + 16} y={34} className="flx-title">DECK {n}</text>
      {/* Loop-Sektion */}
      <Btn id={`loopcall_${n}`} x={ox + 16} y={48} w={62} label="CUE/LOOP ◀▶" />
      <Btn id={`loopin_${n}`} x={ox + 84} y={48} w={30} label="IN" />
      <Btn id={`loopout_${n}`} x={ox + 119} y={48} w={34} label="OUT" />
      <Btn id={`loop4_${n}`} x={ox + 158} y={48} w={70} label="4 BEAT/EXIT" />
      <Btn id={`sync_${n}`} x={ox + 250} y={48} w={64} label="BEAT SYNC" />
      {/* Jogwheel */}
      <g className={cls(`jog_${n}`)}>
        <circle cx={ox + 140} cy={176} r={84} className="flx-shape" />
        <circle cx={ox + 140} cy={176} r={58} className="flx-inner" />
        <text x={ox + 140} y={180} className="flx-label flx-in">JOG</text>
      </g>
      <Fader id={`tempo_${n}`} x={ox + 284} y={92} h={160} label="TEMPO" />
      {/* Transport */}
      <g className={cls(`cue_${n}`)}>
        <circle cx={ox + 40} cy={306} r={19} className="flx-shape" />
        <text x={ox + 40} y={310} className="flx-label flx-in">CUE</text>
      </g>
      <g className={cls(`play_${n}`)}>
        <circle cx={ox + 40} cy={362} r={19} className="flx-shape" />
        <text x={ox + 40} y={366} className="flx-label flx-in">▶ / ❚❚</text>
      </g>
      {/* Performance-Pads */}
      <text x={ox + 84} y={282} className="flx-caption">HOT CUE · PADS</text>
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} className={cls(`pad${i + 1}_${n}`)}>
          <rect x={ox + 84 + (i % 4) * 58} y={290 + Math.floor(i / 4) * 52} width={50} height={44} rx={6} className="flx-shape" />
          <text x={ox + 109 + (i % 4) * 58} y={316 + Math.floor(i / 4) * 52} className="flx-label flx-in">{i + 1}</text>
        </g>
      ))}
    </g>
  );

  const Channel = ({ n, x }: { n: 1 | 2; x: number }) => (
    <g>
      <Btn id={`load_${n}`} x={x - 22} y={22} w={44} label={`LOAD ${n}`} />
      <Knob id={`trim_${n}`} x={x} y={66} label="TRIM" />
      <Knob id={`hi_${n}`} x={x} y={112} label="HI" />
      <Knob id={`mid_${n}`} x={x} y={158} label="MID" />
      <Knob id={`low_${n}`} x={x} y={204} label="LOW" />
      <Knob id={`cfx_${n}`} x={x} y={252} label="CFX" r={15} />
      <Btn id={`hpcue_${n}`} x={x - 20} y={284} w={40} label="🎧 CUE" round />
      <Fader id={`fader_${n}`} x={x} y={310} h={62} label="" />
    </g>
  );

  return (
    <svg viewBox="0 0 1000 420" className="block w-full" role="img" aria-label="Schema des DDJ-FLX4 mit hervorgehobenen Bedienelementen">
      <rect x={2} y={2} width={996} height={416} rx={20} className="flx-body" />
      <Deck n={1} ox={12} />
      <Deck n={2} ox={658} />
      {/* Mixer */}
      <rect x={352} y={12} width={296} height={396} rx={14} className="flx-panel" />
      <Channel n={1} x={456} />
      <Channel n={2} x={544} />
      <g className={cls("browse")}>
        <circle cx={500} cy={31} r={11} className="flx-shape" />
        <text x={500} y={56} className="flx-label">BROWSE</text>
      </g>
      <text x={500} y={316} className="flx-caption" textAnchor="middle">KANALFADER</text>
      <Btn id="smart_fader" x={364} y={300} w={62} label="SMART FADER" />
      <Btn id="smart_cfx" x={364} y={244} w={62} label="SMART CFX" />
      <Knob id="master" x={395} y={66} label="MASTER" />
      <Knob id="hpmix" x={395} y={130} label="🎧 MIX" />
      <Knob id="hplevel" x={395} y={190} label="🎧 LEVEL" />
      {/* Beat FX */}
      <text x={605} y={34} className="flx-title" textAnchor="middle">BEAT FX</text>
      <Btn id="beatfx_beat" x={577} y={46} w={56} label="BEAT ◀ ▶" />
      <Btn id="beatfx_select" x={577} y={76} w={56} label="SELECT" />
      <Btn id="beatfx_ch" x={577} y={106} w={56} label="CH 1·2·M" />
      <Knob id="beatfx_depth" x={605} y={162} label="LEVEL/DEPTH" r={15} />
      <g className={cls("beatfx_onoff")}>
        <circle cx={605} cy={226} r={18} className="flx-shape" />
        <text x={605} y={230} className="flx-label flx-in">ON/OFF</text>
      </g>
      <g className={cls("crossfader")}>
        <rect x={430} y={390} width={140} height={4} rx={2} className="flx-track" />
        <rect x={488} y={381} width={24} height={22} rx={4} className="flx-shape" />
      </g>
    </svg>
  );
}
