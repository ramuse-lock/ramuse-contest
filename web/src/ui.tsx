// 小さな共通部品
import type { ComponentChildren } from 'preact';
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
  return (
    <>
      <div class={`dim${top ? ' top' : ''}`} onClick={onClose} />
      <div class={`sheet${top ? ' top' : ''}`} role="dialog" aria-label={title}>
        <div class="grab" />
        <div class="shd">
          {left ?? <button class="cancel" onClick={onClose}>キャンセル</button>}
          <span class="ttl">{title}</span>
          {right ?? <span class="cancel" />}
        </div>
        <div class="sbody">{children}</div>
        {footer && <div class="sfoot">{footer}</div>}
      </div>
    </>
  );
}
