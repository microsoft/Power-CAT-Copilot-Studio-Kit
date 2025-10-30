<?xml version="1.0" ?><xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"><xsl:output method="text" indent="no"/><xsl:template match="/data"><![CDATA[<div data-wrapper="true" dir="ltr" style="font-family:&quot;Segoe UI&quot;; font-size:9pt">
<p style="margin:0">Your Copilot Studio Agent {{AgentName}} has been placed in quarantine due to one or more policy or compliance violations. While quarantined, the agent is unavailable to users and cannot process new requests.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0">Please review and fix the identified violations, then coordinate with your environment administrator to validate and remediate the issue. Once your admin confirms the resolution, your agent can be unquarantined and returned to active status.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0"><strong>Next steps:</strong></p>
<ol>
<li>Review the violations and recommended fixes in the Agent Settings &gt; Compliance tab.</li><li>Make necessary updates or configuration changes.</li><li>Notify your administrator for final review and unquarantine approval.</li></ol>
<p style="margin:0">&nbsp;</p>
<p style="margin:0">Thank you for your prompt attention to this matter. Maintaining compliant and secure agents helps ensure a safe experience for all users.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0">— The Copilot Studio Compliance Team</p>
<p style="margin:0">{{AdminAlias}}</p>
</div>]]></xsl:template></xsl:stylesheet>