import { ArrowRight } from 'lucide-react';

export default function SectionHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && onAction && (
        <button className="text-link" type="button" onClick={onAction}>
          {action}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
