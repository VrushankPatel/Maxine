{{/*
Expand the name of the chart.
*/}}
{{- define "maxine.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "maxine.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart label.
*/}}
{{- define "maxine.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "maxine.labels" -}}
helm.sh/chart: {{ include "maxine.chart" . }}
{{ include "maxine.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "maxine.selectorLabels" -}}
app.kubernetes.io/name: {{ include "maxine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Service account name.
*/}}
{{- define "maxine.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "maxine.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "maxine.secretName" -}}
{{- default (printf "%s-auth" (include "maxine.fullname" .)) .Values.auth.existingSecret -}}
{{- end -}}

{{- define "maxine.configMapName" -}}
{{- printf "%s-config" (include "maxine.fullname" .) -}}
{{- end -}}

{{- define "maxine.dataClaimName" -}}
{{- if .Values.persistence.existingClaim -}}
{{- .Values.persistence.existingClaim -}}
{{- else -}}
{{- printf "%s-data" (include "maxine.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "maxine.logsClaimName" -}}
{{- if .Values.logs.persistence.existingClaim -}}
{{- .Values.logs.persistence.existingClaim -}}
{{- else -}}
{{- printf "%s-logs" (include "maxine.fullname" .) -}}
{{- end -}}
{{- end -}}
