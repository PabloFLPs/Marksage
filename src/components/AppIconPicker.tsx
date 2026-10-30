import { Check } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { APP_ICON_IDS, appIconLabelKey, appIconUrl, type AppIconId } from '../lib/appIcons'

interface AppIconPickerProps {
  value: AppIconId
  onChange: (id: AppIconId) => void
  theme: 'light' | 'dark'
}

export function AppIconPicker({ value, onChange, theme }: AppIconPickerProps) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('appearance.iconLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {APP_ICON_IDS.map((id) => {
        const selected = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`group relative flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors ${
              selected
                ? 'border-accent text-accent dark:border-dark-accent dark:text-dark-accent'
                : 'border-line text-ink-muted hover:border-accent/60 hover:text-ink dark:border-dark-line dark:text-dark-ink-muted dark:hover:border-dark-accent/60 dark:hover:text-dark-ink'
            }`}
          >
            <img
              src={appIconUrl(id, theme)}
              alt=""
              className="h-10 w-10 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:-rotate-3"
            />
            {t(appIconLabelKey(id))}
            {selected && (
              <span className="anim-pop absolute right-1.5 top-1.5 rounded-full bg-accent p-0.5 text-white dark:bg-dark-accent dark:text-dark-surface">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
