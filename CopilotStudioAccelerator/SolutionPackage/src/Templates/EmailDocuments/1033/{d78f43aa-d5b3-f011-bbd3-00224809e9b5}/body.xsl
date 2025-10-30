<?xml version="1.0" ?><xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0"><xsl:output method="text" indent="no"/><xsl:template match="/data"><![CDATA[<div data-wrapper="true" dir="ltr" style="font-family:&quot;Segoe UI&quot;; font-size:9pt">
<p style="margin:0">Your case <strong>{{CaseID}}</strong> has been reviewed and <strong>
rejected</strong>. As a result, the associated Copilot Studio Agent <strong>{{AgentName}}</strong> will be
<strong>deleted in one business day</strong>.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0"><strong>Important:</strong><br>
Makers have the option to <strong>download the agent in a solution</strong> before deletion occurs. This is your last opportunity to preserve the agent’s configuration and assets.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0"><strong>Next steps:</strong></p>
<ul>
<li>If you wish to retain the agent, export it as a solution immediately.</li><li>Review compliance and policy requirements before creating future agents to avoid similar outcomes.</li></ul>
<p style="margin:0">&nbsp;</p>
<p style="margin:0">Thank you for your attention to this matter. Maintaining compliance ensures a secure and consistent experience for all users.</p>
<p style="margin:0">&nbsp;</p>
<p style="margin:0">— The Copilot Studio Compliance Team<br>
{{AdminAlias}}</p>
</div>]]></xsl:template></xsl:stylesheet>