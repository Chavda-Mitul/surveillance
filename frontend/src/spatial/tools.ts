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
    layer: "satellite" | "flight"
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
    layer: "satellite" | "flight"
    identifier: string
  }
}

export interface ShowInfoAction {
  type: "showInfo"
  payload: {
    message: string
  }
}

export interface AnswerQueryAction {
  type: "answerQuery"
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
  | AnswerQueryAction

export interface QueryResult {
  response: string
  actions: SpatialAction[]
  conversationId: string
}