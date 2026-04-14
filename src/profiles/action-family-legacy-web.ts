import type { AnalysisProfile, DetectionResult } from "../core/profile.js";
import { AntBuildXmlAdapter } from "../adapters/ant-build-xml.js";
import { WebXmlAdapter } from "../adapters/web-xml.js";
import { ActionConfigAdapter } from "../adapters/action-config.js";
import { JavaSourceBasicAdapter } from "../adapters/java-source-basic.js";
import { JspViewAdapter } from "../adapters/jsp-view.js";
import { IbatisSqlMapAdapter } from "../adapters/ibatis-sql-map.js";
import { MyBatisMapperAdapter } from "../adapters/mybatis-mapper.js";
import { SiteMeshConfigAdapter } from "../adapters/sitemesh-config.js";

export class ActionFamilyLegacyWebProfile implements AnalysisProfile {
  readonly id = "action-family-legacy-web";
  readonly name = "Action-family Legacy Web";
  readonly version = "0.1.0";
  readonly description = "Legacy action/filter web profile with Struts and Stripes style routing";
  readonly projectType = "enterprise-webapp";
  readonly technologyTags = ["java", "ant", "struts", "stripes", "xml", "jsp"];

  detect(filePaths: string[]): DetectionResult {
    let score = 0;
    const reasons: string[] = [];

    if (filePaths.some((file) => file.endsWith("build.xml"))) {
      score += 2;
      reasons.push("build.xml");
    }
    if (filePaths.some((file) => file.endsWith("web.xml"))) {
      score += 3;
      reasons.push("web.xml");
    }
    if (filePaths.some((file) => file.endsWith("struts.xml"))) {
      score += 6;
      reasons.push("struts.xml");
    }
    if (filePaths.some((file) => file.endsWith("ActionBean.java"))) {
      score += 5;
      reasons.push("action-bean");
    }
    if (filePaths.some((file) => file.endsWith(".jsp"))) {
      score += 1;
      reasons.push("jsp");
    }

    return {
      matched: score >= 8,
      score,
      reasons,
    };
  }

  getRequiredAdapters() {
    return [
      new AntBuildXmlAdapter(),
      new WebXmlAdapter(),
      new JavaSourceBasicAdapter(),
      new ActionConfigAdapter(),
      new IbatisSqlMapAdapter(),
      new MyBatisMapperAdapter(),
      new JspViewAdapter(),
      new SiteMeshConfigAdapter(),
    ];
  }
}
