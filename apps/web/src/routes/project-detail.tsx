import { useParams } from 'react-router';
import { ProjectDetailPage } from '../features/projects/components/ProjectDetailPage/ProjectDetailPage';

export function ProjectDetailRoute() {
  const { id } = useParams();
  return <ProjectDetailPage projectId={id ?? ''} />;
}
