/**
 * Tool call action types returned by the LLM
 */
export interface FlyToAction {
  type: "flyTo"
  payload: {
    latitude: number
    longitude: number
    altitude?: number
    name?: string
  }
}

export interface FilterLayerAction {
  type: "filterLayer"
  payload: {
    layer: "satellite" | "vessel"
    filter: string
  }
}

export interface SwitchModeAction {
  type: "switchMode"
  payload: {
    mode: string
  }
}

export interface TrackEntityAction {
  type: "trackEntity"
  payload: {
    layer: "satellite" | "vessel"
    identifier: string
  }
}

export interface ShowInfoAction {
  type: "showInfo"
  payload: {
    message: string
  }
}

export type SpatialAction =
  | FlyToAction
  | FilterLayerAction
  | SwitchModeAction
  | TrackEntityAction
  | ShowInfoAction

export interface QueryResult {
  response: string
  actions: SpatialAction[]
  conversationId: string
}