interface Props {
  demo: boolean;
  onChange: (demo: boolean) => void;
}

// Demo bypasses the spaced-repetition wait: every item is shown and grading
// advances the stage immediately, so you can walk encounter -> cloze -> socratic
// without waiting for due dates. SR math is unchanged.
export default function DemoToggle({ demo, onChange }: Props) {
  return (
    <label className="demo-toggle" title="Skip the spaced-repetition wait (testing)">
      <input type="checkbox" checked={demo} onChange={(e) => onChange(e.target.checked)} />
      Demo mode
    </label>
  );
}
