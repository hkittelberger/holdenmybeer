import { redirect } from '@sveltejs/kit';
import { COOKIE_NAME, tokenValid } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	if (!(await tokenValid(cookies.get(COOKIE_NAME)))) throw redirect(303, '/music/admin');
	return {};
};
