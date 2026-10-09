import { redirect } from 'next/navigation';

export default function ArchivedCatalogPage() {
  redirect('/admin/catalog?archived=true');
}
