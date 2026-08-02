import { redirect } from 'next/navigation';

export default function OldOutgoingRedirect() {
  redirect('/inventory/mutations');
}
