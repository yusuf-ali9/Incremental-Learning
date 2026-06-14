import type { Grade } from "../api.js";

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: "again", label: "Again", hint: "Forgot — see again soon" },
  { grade: "hard", label: "Hard", hint: "Recalled with difficulty" },
  { grade: "good", label: "Good", hint: "Recalled correctly" },
  { grade: "easy", label: "Easy", hint: "Trivially easy" },
];

interface Props {
  disabled?: boolean;
  onGrade: (grade: Grade) => void;
}

export default function GradeBar({ disabled, onGrade }: Props) {
  return (
    <div className="gradebar">
      {GRADES.map((g) => (
        <button
          key={g.grade}
          className={`grade grade-${g.grade}`}
          disabled={disabled}
          title={g.hint}
          onClick={() => onGrade(g.grade)}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
