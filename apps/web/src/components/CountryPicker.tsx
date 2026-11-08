import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2, Search, X } from 'lucide-react';
import { COUNTRIES, countryByCode, type Country } from '../lib/countries';
import { cn } from '../lib/utils';
import { Modal } from './Modal';

interface CountryPickerProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  className?: string;
}

function flagFor(country: Country): string {
  if (country.flag) return country.flag;
  return country.code
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function CountryPicker({
  id,
  value,
  onChange,
  placeholder = 'Select your country',
  disabled = false,
  required = false,
  allowClear = false,
  className,
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = countryByCode(value);

  const results = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return COUNTRIES;
    return COUNTRIES.filter((country) => {
      const name = normalize(country.name);
      const code = country.code.toLowerCase();
      return (
        name.includes(query) ||
        code.includes(query) ||
        normalize(country.region).includes(query)
      );
    });
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  const choose = (country: Country): void => {
    onChange(country.code);
    setOpen(false);
  };

  const clear = (): void => {
    onChange('');
  };

  return (
    <>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-required={required}
          className={cn(
            'field flex items-center justify-between gap-3 text-left',
            !selected && 'text-ink-500',
            allowClear && selected && 'pr-11',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {selected ? (
              <>
                <span aria-hidden="true" className="text-base leading-none">
                  {flagFor(selected)}
                </span>
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <>
                <Globe2 className="h-4 w-4 shrink-0 text-ink-500" />
                <span className="truncate">{placeholder}</span>
              </>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
        </button>
        {allowClear && selected && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-500 transition hover:bg-white/10 hover:text-white"
            aria-label="Clear country"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Select your country"
        description="Search all countries and territories, or browse the full list."
        className="max-w-md"
      >
        <div className="sticky top-0 z-10 -mx-1 bg-ink-850 pb-3 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && results[0]) {
                  event.preventDefault();
                  choose(results[0]);
                }
              }}
              placeholder="Search by country name, code or region…"
              className="field pl-10"
              aria-label="Search countries"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="mt-2 px-1 text-[0.625rem] text-ink-500" aria-live="polite">
            {results.length} {results.length === 1 ? 'country' : 'countries'}
            {search.trim() ? ' found' : ' and territories'}
          </p>
        </div>

        <div className="-mx-1 max-h-[54vh] overflow-y-auto overscroll-contain">
          {results.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Globe2 className="mx-auto h-8 w-8 text-ink-600" />
              <p className="mt-3 text-sm font-semibold text-white">No matches</p>
              <p className="mt-1 text-xs text-ink-400">
                Try a different spelling or the two-letter country code.
              </p>
            </div>
          )}

          {results.map((country) => {
            const active = country.code === selected?.code;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => choose(country)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                  active
                    ? 'bg-neon/[0.12] text-white'
                    : 'text-ink-200 hover:bg-white/[0.05] hover:text-white',
                )}
              >
                <span aria-hidden="true" className="w-7 shrink-0 text-lg leading-none">
                  {flagFor(country)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {country.name}
                </span>
                <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-ink-500">
                  {country.code}
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-neon" />}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
