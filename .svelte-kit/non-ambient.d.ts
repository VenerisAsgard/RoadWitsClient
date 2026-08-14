
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>
		};
		Pathname(): "/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/assets/logo.png" | "/favicon.png" | "/fonts/Fira_Code/FiraCode-VariableFont_wght.ttf" | "/fonts/Fira_Code/OFL.txt" | "/fonts/Fira_Code/README.txt" | "/fonts/Fira_Code/static/FiraCode-Bold.ttf" | "/fonts/Fira_Code/static/FiraCode-Light.ttf" | "/fonts/Fira_Code/static/FiraCode-Medium.ttf" | "/fonts/Fira_Code/static/FiraCode-Regular.ttf" | "/fonts/Fira_Code/static/FiraCode-SemiBold.ttf" | "/fonts/Noto_Color_Emoji/NotoColorEmoji-Regular.ttf" | "/fonts/Noto_Color_Emoji/OFL.txt" | "/fonts/Rubik/OFL.txt" | "/fonts/Rubik/README.txt" | "/fonts/Rubik/Rubik-Italic-VariableFont_wght.ttf" | "/fonts/Rubik/Rubik-VariableFont_wght.ttf" | "/fonts/Rubik/static/Rubik-Black.ttf" | "/fonts/Rubik/static/Rubik-BlackItalic.ttf" | "/fonts/Rubik/static/Rubik-Bold.ttf" | "/fonts/Rubik/static/Rubik-BoldItalic.ttf" | "/fonts/Rubik/static/Rubik-ExtraBold.ttf" | "/fonts/Rubik/static/Rubik-ExtraBoldItalic.ttf" | "/fonts/Rubik/static/Rubik-Italic.ttf" | "/fonts/Rubik/static/Rubik-Light.ttf" | "/fonts/Rubik/static/Rubik-LightItalic.ttf" | "/fonts/Rubik/static/Rubik-Medium.ttf" | "/fonts/Rubik/static/Rubik-MediumItalic.ttf" | "/fonts/Rubik/static/Rubik-Regular.ttf" | "/fonts/Rubik/static/Rubik-SemiBold.ttf" | "/fonts/Rubik/static/Rubik-SemiBoldItalic.ttf" | string & {};
	}
}