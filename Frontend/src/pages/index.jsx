import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getUser } from '../lib/api';

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    getUser() ? router.replace('/dashboard') : router.replace('/login');
  }, []);
  return null;
}
