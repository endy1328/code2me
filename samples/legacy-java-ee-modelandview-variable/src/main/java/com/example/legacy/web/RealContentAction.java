package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.ModelAndView;

@Controller
@RequestMapping("/product/content")
public class RealContentAction {
  @RequestMapping("/realList.as")
  public ModelAndView getContentRealListInfo() {
    String uri = "";
    uri = "/product/content/contentRealList";
    return new ModelAndView(uri);
  }

  @RequestMapping("/detail.as")
  public String detail() {
    return "product/content/contentDetail";
  }
}
