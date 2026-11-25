export function AuthField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3.5 ring-1 ring-line outline-none transition-shadow duration-150 placeholder:text-muted focus:ring-2 focus:ring-green"
      />
    </label>
  );
}
