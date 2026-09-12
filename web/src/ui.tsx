// 小さな共通部品
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { famClass, famJa } from './model';

export function Icon({ name, fill = false, className = '', style }: { name: string; fill?: boolean; className?: string; style?: string }) {
  return <span class={`ms${fill ? ' f' : ''} ${className}`} style={style} aria-hidden="true">{name}</span>;
}

export function Glass({ children, className = '', style }: { children: ComponentChildren; className?: string; style?: string }) {
  return <div class={`glass ${className}`} style={style}>{children}</div>;
}

export function Tile({ icon, tone, fill = false }: { icon: string; tone: string; fill?: boolean }) {
  return <span class={`tile ${tone}`}><Icon name={icon} fill={fill} /></span>;
}

export function Pill({ tone, icon, children }: { tone: string; icon?: string; children: ComponentChildren }) {
  return <span class={`pill ${tone}`}>{icon && <Icon name={icon} />}{children}</span>;
}

export function TypeBadge({ round }: { round: string }) {
  const cls = round === '決勝' ? 'ty-final' : round === '予選' ? 'ty-qual' : 'ty-single';
  return <span class={`type ${cls}`}>{round || '単発'}</span>;
}

export function Avatar({ fam, small = false, on, onClick }: { fam: string; small?: boolean; on?: boolean; onClick?: () => void }) {
  return (
    <span class={`av av-${famClass(fam)}${on ? ' on' : ''}`} style={small ? 'width:26px;height:26px;font-size:10.5px' : ''} title={famJa(fam)} onClick={onClick} role={onClick ? 'button' : undefined}>
      {fam.slice(0, 1)}
    </span>
  );
}

// 家族の選択（単一 or 複数）
export function WhoPicker({ fams, value, onChange, small = false }: { fams: string[]; value: string[]; onChange: (v: string[]) => void; small?: boolean }) {
  return (
    <span class="who">
      {fams.map((f) => <Avatar fam={f} small={small} on={value.includes(f)} onClick={() => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f])} />)}
    </span>
  );
}
export function OnePicker({ fams, value, onChange, small = false }: { fams: string[]; value: string; onChange: (v: string) => void; small?: boolean }) {
  return <span class="who">{fams.map((f) => <Avatar fam={f} small={small} on={value === f} onClick={() => onChange(f)} />)}</span>;
}

export function WhoChips({ fams }: { fams: string[] }) {
  return <span class="who-chips">{fams.map((f) => <i class={`w${famClass(f)}`} title={famJa(f)} />)}</span>;
}

export function Check({ on, onClick }: { on: boolean; onClick?: (e: Event) => void }) {
  return <button type="button" class={`chk${on ? ' on' : ''}`} onClick={onClick} aria-label={on ? '済' : '未'}>{on && <Icon name="check" />}</button>;
}

export function SectionHead({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <div class="sec-hd">
      <span class="kicker">{title}</span>
      {more && <button class="more" onClick={onMore}>{more}<Icon name="chevron_right" /></button>}
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

// ---- フォーム部品 ----
export function Seg<T extends string>({ options, value, onChange, small = false }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div class={`seg${small ? ' sm' : ''}`}>
      {options.map((o) => <button type="button" class={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" class={`tgl${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}
export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <div class="fld"><span class="lb">{label}</span><div class="in">{children}</div></div>;
}

// ---- ボトムシート ----
export function Sheet({ title, onClose, children, footer, left, right, top = false }: {
  title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; left?: ComponentChildren; right?: ComponentChildren; top?: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  // 上の横棒とタイトル行を下へ引っぱると閉じる（iOSの標準的な操作に合わせる）
  const drag = useRef({ on: false, y0: 0, dy: 0, t: 0, v: 0 });

  function paint(dy: number) {
    if (sheet.current) sheet.current.style.transform = dy ? `translateY(${dy}px)` : '';
    if (dim.current) dim.current.style.opacity = String(Math.max(0, 1 - dy / 420));
  }
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return; // ヘッダーのボタンは押せるまま
    const d = drag.current;
    d.on = true; d.y0 = e.clientY; d.dy = 0; d.t = e.timeStamp; d.v = 0;
    if (sheet.current) sheet.current.style.transition = 'none';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d.on) return;
    const dy = Math.max(0, e.clientY - d.y0);
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = (dy - d.dy) / dt;
    d.dy = dy; d.t = e.timeStamp;
    paint(dy);
  }
  function up() {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    if (sheet.current) sheet.current.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)';
    if (dim.current) dim.current.style.transition = 'opacity .24s linear';
    // しっかり下ろしたか、勢いよく払ったら閉じる
    if (d.dy > 96 || (d.dy > 32 && d.v > 0.5)) {
      if (sheet.current) sheet.current.style.transform = 'translateY(100%)';
      if (dim.current) dim.current.style.opacity = '0';
      window.setTimeout(onClose, 200);
    } else {
      paint(0);
    }
  }

  return (
    <>
      <div class={`dim${top ? ' top' : ''}`} ref={dim} onClick={onClose} />
      <div class={`sheet${top ? ' top' : ''}`} ref={sheet} role="dialog" aria-label={title}>
        <div class="grip" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div class="grab" />
          <div class="shd">
            {left ?? <button class="cancel" onClick={onClose}>キャンセル</button>}
            <span class="ttl">{title}</span>
            {right ?? <span class="cancel" />}
          </div>
        </div>
        <div class={`sbody${footer ? '' : ' pb'}`}>{children}</div>
        {footer && <div class="sfoot">{footer}</div>}
      </div>
    </>
  );
}
