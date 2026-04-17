export function toOnOff(value: boolean, truthyLabel = "on", falsyLabel = "off"): string {
	return value ? truthyLabel : falsyLabel;
}
