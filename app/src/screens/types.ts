import type { ImageContainerProperty, ListContainerProperty, TextContainerProperty } from '@evenrealities/even_hub_sdk'

/**
 * Field shape shared by CreateStartUpPageContainer and RebuildPageContainer.
 * The SDK requires createStartUpPageContainer for the very first screen an
 * app shows and rebuildPageContainer for every screen after that, so screens
 * build a plain spec and the router (main.ts) picks the right wrapper.
 */
export interface PageSpec {
  containerTotalNum: number
  listObject?: ListContainerProperty[]
  textObject?: TextContainerProperty[]
  imageObject?: ImageContainerProperty[]
}
