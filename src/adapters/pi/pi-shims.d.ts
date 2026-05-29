declare module "@earendil-works/pi-coding-agent" {
  export type ExtensionAPI = any;
  export type ExtensionContext = any;
  export type ExtensionCommandContext = any;
}

declare module "@earendil-works/pi-ai" {
  export function StringEnum<T extends readonly string[]>(values: T): any;
}

declare module "typebox" {
  export const Type: any;
}
