import { redirect } from 'next/navigation';

export default function OldIncomingRedirect() {
  redirect('/inventory/mutations');
}
