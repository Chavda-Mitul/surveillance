import { styles } from "./styles"

export function HelpPanel() {
  return (
    <div style={styles.helpPanel}>
      <div>Click: Fly to satellite</div>
      <div>Double-click: Track satellite + show orbit</div>
      <div>Hover: Show name</div>
    </div>
  )
}
