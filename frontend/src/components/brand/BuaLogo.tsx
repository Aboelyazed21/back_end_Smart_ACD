import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/format';
import buaGlobe from '../../assets/bua-globe.png';
import buaWordmark from '../../assets/bua-wordmark.png';
import buaGlobeWhite from '../../assets/bua-globe-white.png';
import buaWordmarkWhite from '../../assets/bua-wordmark-white.png';

type LogoVariant = 'navy' | 'white';

const ART: Record<LogoVariant, { globe: string; wordmark: string }> = {
  navy: { globe: buaGlobe, wordmark: buaWordmark },
  white: { globe: buaGlobeWhite, wordmark: buaWordmarkWhite },
};

/**
 * Official BUA lockup, split into two images so that only the globe mark
 * rotates while the wordmark stays upright. The artwork itself is untouched.
 */
export function BuaLogo({
  variant = 'navy',
  className,
  globeClassName = 'h-11 w-11',
  wordmarkClassName = 'h-10 w-auto',
  spinning = true,
}: {
  variant?: LogoVariant;
  className?: string;
  globeClassName?: string;
  wordmarkClassName?: string;
  spinning?: boolean;
}) {
  const art = ART[variant];
  const { t } = useTranslation();

  return (
    <span
      dir="ltr"
      className={cn('inline-flex shrink-0 items-center gap-1.5', className)}
      role="img"
      aria-label={t('شعار جامعة بدر بأسيوط')}
    >
      <img
        src={art.globe}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn('select-none', spinning && 'animate-globe-spin', globeClassName)}
      />
      <img
        src={art.wordmark}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn('shrink-0 select-none', wordmarkClassName)}
      />
    </span>
  );
}
