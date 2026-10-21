import {redirect} from 'next/navigation';
import {getSession} from '@/lib/auth';
import AuditClient from './audit-client';
export default async function Page(){const session=await getSession();if(!session)redirect('/login');if(session.user.role!=='ADMIN')redirect('/');return <AuditClient/>;}
