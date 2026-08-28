import { fail, redirect } from '@sveltejs/kit';
import { COOKIE_NAME, mintToken, passwordOk, tokenValid } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return { unlocked: await tokenValid(cookies.get(COOKIE_NAME)) };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		if (!passwordOk(password)) return fail(401, { error: 'Incorrect password.' });

		const token = await mintToken();
		cookies.set(token.name, token.value, {
			path: '/music/admin',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: token.maxAge
		});
		throw redirect(303, '/music/admin');
	},

	logout: async ({ cookies }) => {
		cookies.delete(COOKIE_NAME, { path: '/music/admin' });
		throw redirect(303, '/music/admin');
	}
};
