'use client';

import { useParams } from 'next/navigation';
import LinkBioClient from '../client';

export default function CustomLinkPage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  return <LinkBioClient slug={slug || ''} />;
}
