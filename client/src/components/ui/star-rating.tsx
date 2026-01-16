import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingProps {
  value: number | null;
  onChange: (next: number) => void;
  readOnly?: boolean;
  size?: "sm" | "md";
}

export function StarRating({ value, onChange, readOnly = false, size = "md" }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const starSize = size === "sm" ? 14 : 20;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = (hover || value || 0) >= star;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(star)}
            onMouseLeave={() => !readOnly && setHover(null)}
            onClick={() => !readOnly && onChange(star)}
            className={`transition-colors ${readOnly ? "cursor-default" : "cursor-pointer"} ${
              active ? "text-yellow-400 fill-yellow-400" : "text-gray-300 fill-transparent"
            }`}
            aria-label={`Rate ${star} out of 5`}
            data-testid={`button-rate-${star}`}
          >
            <Star size={starSize} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
