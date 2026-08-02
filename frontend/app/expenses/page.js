import { redirect } from 'next/navigation';

export default function OldExpensesRedirect() {
  redirect('/finance');
}
