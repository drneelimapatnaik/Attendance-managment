/** 404 inside the app shell. */
import { ButtonLink, EmptyState } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/ui';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="card">
      <EmptyState
        icon="explore_off"
        title="We couldn't find that page"
        description="The link may be outdated, or the record may have been removed."
        action={
          <ButtonLink to="/dashboard" icon="dashboard" variant="tonal">
            Back to dashboard
          </ButtonLink>
        }
      />
    </div>
  );
}
