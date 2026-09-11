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

export function Avatar({ fam, small = false }: { fam: string; small?: boolean }) {
  return <span class={`av av-${famClass(fam)}`} style={small ? 'width:26px;height:26px;font-size:10.5px' : ''} title={famJa(fam)}>{fam.slice(0, 1)}</span>;
}

export function WhoChips({ fams }: { fams: string[] }) {
  return <span class="who-chips">{fams.map((f) => <i class={`w${famClass(f)}`} title={famJa(f)} />)}</span>;
}

export function Check({ on }: { on: boolean }) {
  return <span class={`chk${on ? ' on' : ''}`}>{on && <Icon name="check" />}</span>;
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
