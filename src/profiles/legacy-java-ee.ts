import type { AnalysisProfile, DetectionResult } from "../core/profile.js";
import { AntBuildXmlAdapter } from "../adapters/ant-build-xml.js";
import { IbatisSqlMapAdapter } from "../adapters/ibatis-sql-map.js";
import { WebXmlAdapter } from "../adapters/web-xml.js";
import { SpringXmlAdapter } from "../adapters/spring-xml.js";
import { JavaSourceBasicAdapter } from "../adapters/java-source-basic.js";
import { JspViewAdapter } from "../adapters/jsp-view.js";
import { MyBatisMapperAdapter } from "../adapters/mybatis-mapper.js";
import { SiteMeshConfigAdapter } from "../adapters/sitemesh-config.js";

export class LegacyJavaEeProfile implements AnalysisProfile {
  readonly id = "legacy-java-ee";
  readonly name = "Legacy Java EE";
  readonly version = "0.1.0";
  readonly description = "Legacy Java EE profile with Ant, web.xml, Spring XML, and Java source scanning";
  readonly projectType = "enterprise-webapp";
  readonly technologyTags = ["java", "ant", "spring-mvc", "xml", "jsp"];

  detect(filePaths: string[]): DetectionResult {
    let score = 0;
    const reasons: string[] = [];

    if (filePaths.some((file) => file.endsWith("build.xml"))) {
      score += 3;
      reasons.push("build.xml");
    }
    if (filePaths.some((file) => file.endsWith("web.xml"))) {
      score += 4;
      reasons.push("web.xml");
    }
    if (filePaths.some((file) => /applicationContext.*\.xml$/.test(file) || /dispatcher.*\.xml$/.test(file))) {
      score += 4;
      reasons.push("spring-xml");
    }
    if (filePaths.some((file) => file.endsWith(".jsp"))) {
      score += 1;
      reasons.push("jsp");
    }

    return {
      matched: score >= 7,
      score,
      reasons,
    };
  }

  getRequiredAdapters() {
    return [
      new AntBuildXmlAdapter(),
      new WebXmlAdapter(),
      new SpringXmlAdapter(),
      new JavaSourceBasicAdapter(),
      new IbatisSqlMapAdapter(),
      new MyBatisMapperAdapter(),
      new JspViewAdapter(),
      new SiteMeshConfigAdapter(),
    ];
  }
}
