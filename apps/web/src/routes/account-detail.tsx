import { useParams } from 'react-router';
import { AccountDetailPage } from '../features/accounts/components/AccountDetailPage/AccountDetailPage';

export function AccountDetailRoute() {
  const { id } = useParams();
  return <AccountDetailPage accountId={id ?? ''} />;
}
